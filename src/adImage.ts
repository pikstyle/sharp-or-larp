const SIZE = 256
const MAX_FILE_BYTES = 10 * 1024 * 1024
const JPEG_QUALITY = 0.85

// Crops a picked image to a square, shrinks it and returns a JPEG in base64.
export async function toAdImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick an image: a logo or a photo.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That image is over 10 MB.')
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image can't be read. Try a PNG or a JPEG.")
  })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error("That image can't be read. Try a PNG or a JPEG.")
  }

  context.fillStyle = '#111111'
  context.fillRect(0, 0, SIZE, SIZE)
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    SIZE,
    SIZE,
  )
  bitmap.close()

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
