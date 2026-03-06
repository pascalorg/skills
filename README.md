# Image Analysis

Extract color palettes from images. Give it a screenshot, Figma export, or design mockup and get back hex, RGB, and HSL values for every dominant color.

Uses [extract-colors](https://github.com/Namide/extract-colors) and [get-pixels](https://github.com/scijs/get-pixels) under the hood.

## Install

```bash
npx skills add pascalorg/image-analysis
```

## Use when

- Matching colors from a screenshot or Figma export in code
- Pulling a color palette from a photo or mockup
- Getting exact hex/RGB values from a reference image

## How it works

1. Pass an image file (PNG, JPG, BMP, GIF) to the script
2. `get-pixels` reads the raw pixel data
3. `extract-colors` finds dominant colors, downsampling to 64k pixels for speed
4. You get back a JSON array sorted by area coverage

```bash
bash <skill-path>/scripts/extract-colors.sh ./screenshot.png
```

## Output

```json
[
  {
    "hex": "#1a1a2e",
    "red": 26,
    "green": 26,
    "blue": 46,
    "hue": 0.6667,
    "saturation": 0.2778,
    "lightness": 0.1412,
    "area": 0.3241
  },
  {
    "hex": "#e94560",
    "red": 233,
    "green": 69,
    "blue": 96,
    "hue": 0.9724,
    "saturation": 0.7928,
    "lightness": 0.5922,
    "area": 0.1856
  }
]
```

| Field      | Type    | Description                    |
|------------|---------|--------------------------------|
| hex        | String  | Hex color value                |
| red        | Integer | Red channel, 0-255             |
| green      | Integer | Green channel, 0-255           |
| blue       | Integer | Blue channel, 0-255            |
| hue        | Number  | Hue, 0-1                       |
| saturation | Number  | Saturation, 0-1                |
| lightness  | Number  | Lightness, 0-1                 |
| area       | Number  | Relative area in the image, 0-1|

## Skill structure

```
SKILL.md                      # Skill definition (agent instructions)
scripts/
  extract-colors.sh           # Entry point, auto-installs deps on first run
  extract-colors.js           # Color extraction using extract-colors + get-pixels
  package.json                # Dependencies
```

## Troubleshooting

**Dependencies fail to install** — Run `cd <skill-path>/scripts && npm install` manually.

**Unsupported format** — `get-pixels` supports PNG, JPG, GIF, and BMP. Convert other formats before extracting.

## License

MIT
