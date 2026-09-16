export default function BookStepGuidance({ step }) {
  if (!step) return null;
  return <section className="book-step-guidance" aria-label="Step 안내">{step.description ?? ""}</section>;
}
