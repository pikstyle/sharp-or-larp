import { findCvProblem } from '../worker/cvCheck.ts'
import type { CvInput } from '../worker/types.ts'
import { errorMessage } from './api.ts'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_PAGES = 10
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)[^\s<>"')]+|\b(?:github|gitlab|linkedin)\.com\/[^\s<>"')]+/gi

// Reads a PDF in the browser and returns its text and links if it is a CV.
export async function readCv(file: File): Promise<CvInput> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That PDF is over 5 MB. A CV should be much lighter.')
  }

  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise.catch(() => {
    throw new Error("That file isn't a readable PDF.")
  })
  const pages: string[] = []
  const links = new Set<string>()

  if (pdf.numPages > MAX_PAGES) {
    throw new Error(`That PDF has ${pdf.numPages} pages. A CV has ${MAX_PAGES} at most.`)
  }

  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))

    for (const annotation of await page.getAnnotations()) {
      if (annotation.subtype === 'Link' && typeof annotation.url === 'string') {
        links.add(annotation.url)
      }
    }
  }

  const text = pages.join('\n')
  const problem = findCvProblem(text)
  if (problem) {
    throw new Error(errorMessage(problem))
  }

  for (const match of text.matchAll(URL_IN_TEXT)) {
    links.add(match[0].replace(/[.,;:]+$/, ''))
  }
  return { text, links: [...links] }
}
