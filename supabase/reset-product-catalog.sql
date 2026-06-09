-- OwnerCheck product catalog reset.
-- Run this in Supabase SQL Editor when you want to remove existing/test products
-- before importing a fresh batch.
--
-- This keeps auth users and profiles. It removes product pages and product-linked
-- activity so the catalog can cold start cleanly.

begin;

delete from public.reports
where target_type in ('product', 'owned_product', 'question', 'answer');

delete from public.credit_transactions
where related_question_id in (
  select id from public.questions
)
or related_answer_id in (
  select id from public.answers
);

delete from public.products;

commit;
