import { useState } from 'react'
import type { CvInput } from '../worker/types.ts'
import { readCv } from './readCv.ts'

export type PickedCv = {
  fileName: string
  input: CvInput
}

type Props = {
  cv: PickedCv | null
  disabled: boolean
  onChange: (cv: PickedCv | null) => void
  onError: (message: string | null) => void
}

// Picks a PDF, checks right away that it is a CV, and lets you remove it.
export default function CvPicker({ cv, disabled, onChange, onError }: Props) {
  const [reading, setReading] = useState(false)

  // Reads the chosen PDF and keeps it only if it reads like a CV.
  async function handleFile(file: File | undefined) {
    if (!file) {
      return
    }

    setReading(true)
    onError(null)
    try {
      onChange({ fileName: file.name, input: await readCv(file) })
    } catch (caught) {
      onChange(null)
      onError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setReading(false)
    }
  }

  if (cv) {
    return (
      <p className="cv-chosen">
        <span>CV: {cv.fileName}</span>
        <button
          type="button"
          className="cv-remove"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label="Remove the CV"
          title="Remove the CV"
        >
          ×
        </button>
      </p>
    )
  }

  return (
    <label className="cv-picker">
      <input
        type="file"
        accept="application/pdf"
        disabled={reading || disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          handleFile(file)
        }}
      />
      {reading ? 'Reading the PDF…' : '+ Add a CV or LinkedIn PDF'}
    </label>
  )
}
