# F1 Car Images

Drop your own car images into these tier folders:

- `starter/`
- `pro/`
- `hyper/`
- `legendary/`

Supported file types: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`

At runtime, `/buycar <tier>` picks a random file from that tier folder.

Set `F1_CAR_IMAGE_BASE_URL` to a publicly reachable URL that maps to this directory tree so images can render in chat clients.
