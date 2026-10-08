export const CV_MIN_CHARS = 300
export const CV_MAX_CHARS = 30000

const MIN_SECTIONS = 2
const MIN_POINTS = 5
const MAX_SECTION_POINTS = 4
const SECTIONS = [
  /\b(work |professional )?experiences?\b/,
  /\bexperiences? professionnelles?\b/,
  /\bwork history\b|\bemployment\b/,
  /\beducation\b|\bformations?\b|\bparcours\b|\bdiplomes?\b/,
  /\b(technical |top )?skills\b|\bcompetences\b/,
  /\bprojects\b|\bprojets\b/,
  /\blanguages\b|\blangues\b/,
  /\bcertifications?\b|\bcertificats?\b/,
  /\binternships?\b|\bstages?\b|\balternance\b/,
  /\binterests\b|\bhobbies\b|\bloisirs\b|\bcentres d.interet\b/,
  /\bvolunteer(ing)?\b|\bbenevolat\b/,
  /\bexperiencia\b|\beducacion\b|\bhabilidades\b|\bidiomas\b/,
  /\bberufserfahrung\b|\bausbildung\b|\bkenntnisse\b|\bsprachen\b/,
]
const CONTACT =
  /[\w.+-]+@[\w-]+\.[\w.]+|linkedin\.com\/in\/|github\.com\/[\w-]+|\+\d{1,3}[\s.-]?\(?\d{1,4}\)?([\s.-]?\d{2,4}){2,4}|\b0\d([\s.-]?\d\d){4}\b|\(\d{3}\)\s?\d{3}[\s.-]\d{4}/
const DATE_RANGE =
  /\b(19|20)\d\d\s*[-–—]\s*((19|20)\d\d|present|now|current|today|aujourd.hui|actuel|en cours)\b|\b(jan|feb|fev|mar|apr|avr|may|mai|jun|juin|jul|juil|aug|aou|sep|oct|nov|dec|janvier|fevrier|mars|avril|juillet|aout|septembre|octobre|novembre|decembre)[a-z]*\.? (19|20)\d\d\b/
const SCHOOL =
  /\buniversit(y|e|at|ad)\b|\bbachelor\b|\bmaster\b|\blicence\b|\bb\.?sc\b|\bm\.?sc\b|\bph\.?d\b|\bdegree\b|\bdiplome\b|\becole\b|\bschool\b|\bcollege\b|\blycee\b|\bbaccalaureat\b|\bbts\b|\biut\b|\bgpa\b/
const WORK =
  /\bintern\b|\bstagiaire\b|\bfreelance\b|\bdevelop(er|peur|peuse)\b|\bengineer\b|\bingenieur\b|\bconsultant\b|\bmanager\b|\bfull[- ]time\b|\bpart[- ]time\b|\bcdi\b|\bcdd\b|\bteaching assistant\b/

export type CvProblem = 'cv_unreadable' | 'cv_too_long' | 'not_a_cv'

// Lowercases, drops accents and glues letter-spaced titles like "S K I L L S".
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\b(?:\p{L} ){2,}\p{L}\b/gu, (letters) => letters.replace(/ /g, ''))
}

// Scores how much a text reads like a CV: sections, contact, dates, school, jobs.
function looksLikeCv(text: string): boolean {
  const normalized = normalize(text)
  const sections = SECTIONS.filter((section) => section.test(normalized)).length
  const hasContact = CONTACT.test(normalized)
  const hasDates = DATE_RANGE.test(normalized)
  const points =
    Math.min(MAX_SECTION_POINTS, sections) +
    [hasContact, hasDates, SCHOOL.test(normalized), WORK.test(normalized)].filter(Boolean).length

  return sections >= MIN_SECTIONS && (hasContact || hasDates) && points >= MIN_POINTS
}

// Tells what is wrong with a CV's text, or null when it reads like a CV.
export function findCvProblem(text: string): CvProblem | null {
  if (text.trim().length < CV_MIN_CHARS) {
    return 'cv_unreadable'
  }
  if (text.length > CV_MAX_CHARS) {
    return 'cv_too_long'
  }
  return looksLikeCv(text) ? null : 'not_a_cv'
}
