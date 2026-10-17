export const SUBJECTS = [
  "Math",
  "History",
  "Science",
  "Language",
  "English",
] as const;
export const DIFFICULTIES = [
  "Easy",
  "Medium",
  "Hard",
  "Teacher-Level",
] as const;
export const FORMATS = [
  "multiple_choice",
  "short_answer",
  "math",
  "mixed",
] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type Format = (typeof FORMATS)[number];
export type QuestionKind = Exclude<Format, "mixed">;
export type Question = {
  id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  topic: string;
  options: string[] | null;
  max_points: number;
  answer_key: string;
  explanation: string;
  rubric: string;
};
export type PublicQuestion = Omit<
  Question,
  "answer_key" | "explanation" | "rubric"
>;
export type AnswerResult = {
  question_id: string;
  attempt_id?: string;
  response: string;
  points: number;
  max_points: number;
  feedback: string;
  topic: string;
};
export type Subject = { id: string; name: string };
export type Exam = {
  id: string;
  subject_id: string;
  name: string;
  exam_date: string | null;
  created_at: string;
};
export type PracticeTest = {
  id: string;
  exam_id: string;
  difficulty: Difficulty;
  format: Format;
  question_count: number;
  time_limit_minutes: number | null;
  topics: string[];
  created_at: string;
  material_id: string;
};
export type Attempt = {
  id: string;
  test_id: string;
  exam_id: string;
  status: "in_progress" | "grading" | "completed";
  responses: Record<string, string>;
  flags: string[];
  score: number | null;
  earned_points: number | null;
  possible_points: number | null;
  started_at: string;
  deadline_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  time_spent_seconds: number | null;
  grading_token?: string | null;
};
export type Prediction = {
  id: string;
  exam_id: string;
  attempt_id: string;
  subject: string;
  predicted: number;
  lower: number;
  upper: number;
  baseline: number;
  adjustment: number;
  confidence: "low" | "moderate" | "higher";
  sample_size: number;
  explanation: string;
  features: PredictionFeatures;
  created_at: string;
  model_version: string;
};
export type ActualGrade = {
  exam_id: string;
  grade: number;
  recorded_at: string;
};
export type PredictionFeatures = {
  latest: number;
  average: number;
  improvement: number;
  difficulty: Difficulty;
  format: Format;
  questionCount: number;
  topics: string[];
  attemptCount: number;
};
export type HistoryExample = {
  examId: string;
  subject: string;
  actual: number;
  baseline: number;
  predicted: number;
  recordedAt: string;
  predictedAt: string;
  features: PredictionFeatures;
};
export type State = {
  subjects: Subject[];
  exams: Exam[];
  tests: PracticeTest[];
  attempts: Attempt[];
  predictions: Prediction[];
  grades: ActualGrade[];
  answers: AnswerResult[];
};
export type AttemptView = {
  attempt: Attempt;
  test: PracticeTest;
  exam: Exam;
  subject: string;
  questions: (PublicQuestion | Question)[];
  results: AnswerResult[];
  prediction: Prediction | null;
};
