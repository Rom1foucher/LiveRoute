# Snapshot OCR profile

The desktop OCR profile stores normalised capture regions, recognition
thresholds, numeric learning data, hotkey configuration, and overlay offsets.
It is kept in the WebView's local storage and can be exported or imported from
the **Settings** tab.

## Coordinates

Every region uses values relative to the complete captured window:

```json
{
  "x": 0.178,
  "y": 0.071,
  "width": 0.027,
  "height": 0.044
}
```

All four values are between `0` and `1`. `x` and `y` identify the top-left
corner; `width` and `height` identify the region size. A profile calibrated on a
2048×1152 window therefore remains usable after resizing when the aspect ratio
and in-game layout are unchanged.

The preview positions regions inside the exact rendered image rectangle rather
than the surrounding letterbox area.

## Active regions

The snapshot flow reads only:

```text
regions.tokens
regions.techniques[0..2].card
regions.techniques[0..2].costSlots[0..4].rect
regions.songs[0..2].card
regions.songs[0..2].cover
regions.songs[0..2].title
```

Technique cost slots always use this order:

| Index | Token   |
| ----: | ------- |
|     0 | Dance   |
|     1 | Passion |
|     2 | Vocal   |
|     3 | Visual  |
|     4 | Mental  |

Profile schema v6 contains the snapshot workflow and supervised numeric
learning. Older profiles remain importable: the normaliser preserves compatible
regions, thresholds, hotkey, and overlay settings while discarding obsolete
automatic-detection branches.

## Calibration

### Token counters

Frame the complete number with a small margin. The configured rectangle is a
logical search area; connected-component localisation finds the actual glyphs
inside it for each capture.

### Technique costs

Frame the logical cell, including zero. The cell label may remain inside the
region because ink colour and connected components isolate the number. Do not
include a neighbouring token column.

The five columns directly produce one `Balance`. A two-colour technique needs
no special region: two non-zero values in the same balance are sufficient.

### Songs

The title region should contain one title line without the type badge. The
cover region should contain only the artwork. Recognition combines both signals
and then restricts candidates to song IDs still present in the solver pool.

## OCR settings

| Field                        | Default | Effect                                                            |
| ---------------------------- | ------: | ----------------------------------------------------------------- |
| `ocr.scale`                  |     2.4 | General crop enlargement before OCR                               |
| `ocr.minWordConfidence`      |      32 | Internal Tesseract confidence floor                               |
| `ocr.minTokenConfidence`     |    0.58 | Token-counter acceptance threshold                                |
| `ocr.minTechniqueConfidence` |    0.54 | Technique-card acceptance threshold                               |
| `ocr.minSongConfidence`      |    0.58 | Combined song-title and cover threshold                           |
| `ocr.maxTokenValue`          |     400 | Out-of-range rejection; scenario cap grows from 200 to 400        |
| `ocr.threshold`              |  `auto` | General preprocessing; learned numeric crops use the source image |
| `ocr.invert`                 |  `auto` | Automatic polarity attempts                                       |

Persisted profiles are normalised with `ocr.maxTokenValue >= 400`. This is a
one-way safety migration for profiles created when the UI still used 250 as an
OCR/calibration ceiling; values such as 263 or 283 are valid in later Grand Live
sections and must be accepted by both recognition and supervised learning.

A single sharp token discontinuity (for example `263 -> 6`) is not automatically
applied even when OCR confidence is high. The draft remains editable and the
user must either correct the value or explicitly confirm that the change is
intentional. Broad multi-colour drift remains reviewable rather than hard-blocked
because it can represent genuine gameplay performed outside OCR.

Do not compensate for an incorrect rectangle by drastically lowering a
threshold. Recalibrate the region first. `scale` remains useful for the general
pipeline, but numeric learning no longer searches for a value-specific zoom.

`numericFieldTuning` stores an ink colour model and labelled glyph templates. A
confirmation appends evidence without replacing the region or older samples.
The template classifier is accepted only when both similarity and margin are
sufficient; otherwise Tesseract reads a tightly localised crop from the source
image. Consensus guards for `0`, `6`, and `9` and manual validation remain
active.

## Window and hotkey

`windowTitlePattern` is a case-insensitive regular expression. Its default is:

```text
umamusume|pretty derby
```

`capture.hotkey` uses Tauri Global Shortcut syntax. Its default is:

```text
CommandOrControl+Shift+Space
```

## Overlay

The overlay uses the three technique or song `card` rectangles. Pixel offsets
can compensate for the difference between the captured Windows frame and the
transparent overlay window:

```json
{
  "offsetX": 0,
  "offsetY": 0,
  "widthDelta": 0,
  "heightDelta": 0
}
```

These values affect overlay placement only; they never change OCR regions.
Detected token values are positioned below the five token-counter rectangles.
Unknown values remain explicit as `?`, which prevents a failed capture from
looking like a valid stale balance.

## Calibration procedure

1. Export the current profile as a backup.
2. Import a full game-window capture.
3. Recalibrate one region family at a time.
4. Take a new snapshot.
5. Review every token value, technique cost, and song candidate.
6. Check overlay placement against the game window.
7. Confirm corrected numeric samples only when the crop is exact.
8. Export the validated profile.

Manual corrections in a pending snapshot do not modify the geometric profile.
Only calibration, explicit numeric learning, or JSON import changes persisted
profile data.
