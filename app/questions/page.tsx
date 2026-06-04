import { QuestionCard } from '@/components/QuestionCard'
import { products, questions } from '@/lib/mockData'

export default function QuestionsPage() {
  const openQuestions = questions.filter(q => q.status === 'open')
  return (
    <main className="mx-auto max-w-5xl px-5 py-12">
      <p className="font-bold text-muted">Earn credits</p>
      <h1 className="text-4xl font-black">Questions waiting for real owners</h1>
      <p className="mt-3 text-muted">Answer questions about products you own. Better answers earn more reputation later.</p>
      <div className="mt-8 space-y-5">
        {openQuestions.map(question => {
          const product = products.find(p => p.id === question.product_id)
          return <QuestionCard key={question.id} question={question} productName={product?.name} />
        })}
      </div>
    </main>
  )
}
