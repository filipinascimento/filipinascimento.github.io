import { FileDown } from "lucide-react";

export function PdfButton() {
  const basePath = "";

  return (
    <a
      className="button button--secondary cv-pdf-button"
      href={`${basePath}/cv/Filipi_Nascimento_Silva_CV.pdf`}
      target="_blank"
      rel="noreferrer"
    >
      <FileDown size={15} aria-hidden="true" /> View or download PDF
    </a>
  );
}
