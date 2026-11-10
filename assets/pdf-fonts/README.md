# PDF fonts

Fonts embedded in the student PDFs (lesson question booklets and formula sheets).

| File | Source | License |
|---|---|---|
| `Heebo-Regular.ttf`, `Heebo-Bold.ttf` | Static instances (wght 400 / 700) of the self-hosted Heebo variable font in `public/fonts`, Hebrew + Latin subsets merged | SIL OFL 1.1 (`OFL-Heebo.txt`) |
| `DejaVuSans-Math-Regular.ttf`, `DejaVuSans-Math-Bold.ttf` | Subset of DejaVu Sans: math operators, Greek letters, super/subscripts missing from Heebo | Bitstream Vera / DejaVu license (`LICENSE-DejaVu.txt`) |

Regenerate the TypeScript module after changing a font: `npm run academy:pdf-fonts`.
