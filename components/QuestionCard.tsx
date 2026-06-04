import { Question } from '@/lib/types'

export function QuestionCard({ question, productName }: { question: Question; productName?: string }) {
  return (
    <div className="card p-5">
      {productName && <p className="text-sm font-bold text-muted">{productName}</p>}
      <h3 className="mt-1 text-lg font-black">{question.question_text}</h3>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className="rounded-full bg-black px-3 py-1 text-white">+{question.credit_reward} credits</span>
        <span className="rounded-full bg-black/5 px-3 py-1">Asked by {question.buyer_name}</span>
        <span className="rounded-full bg-black/5 px-3 py-1">{question.status}</span>
      </div>
      <form className="mt-4 space-y-3">
        <textarea className="input min-h-24" placeholder="Answer as a real owner..." />
        <button type="button" className="btn btn-dark">Submit answer</button>
      </form>
    </div>
  )
}
