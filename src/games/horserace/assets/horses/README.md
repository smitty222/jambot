# Horse tier images

Drop your own horse images into these tier folders:

- `basic/`
- `elite/`
- `champion/`

Allowed extensions: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`

At runtime, `/buyhorse <tier>` shows available options and `/buyhorse <tier> <option#>` buys that exact image.

Set `HORSE_IMAGE_BASE_URL` to a publicly reachable URL that maps to this directory tree so images can render in chat clients.
