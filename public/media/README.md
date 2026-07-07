# media

Drop audio/text files from other projects here; they're served at `/media/<name>`.

Embed audio in any markdown page with:

```html
<audio controls src="/media/example.mp3"></audio>
```

Keep total size under ~1 GB; beyond that, move to object storage
(e.g. Cloudflare R2) and link to the bucket instead.
