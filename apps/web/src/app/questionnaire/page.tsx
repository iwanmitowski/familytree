import type { Metadata } from 'next';
import { QuestionnaireProvider } from '@/features/questionnaire/store';
import { QuestionnaireForm } from '@/features/questionnaire/QuestionnaireForm';

export const metadata: Metadata = { title: 'Въпросник' };

export default function QuestionnairePage() {
  return (
    <QuestionnaireProvider>
      <QuestionnaireForm />
    </QuestionnaireProvider>
  );
}
