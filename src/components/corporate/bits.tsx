import { Badge } from "@/components/ui";
import { COMPANY_STATUS_LABEL, INVOICE_STATUS_LABEL, type CompanyInvoice, type CompanyStatus } from "@/lib/types-corporate";
import { dayKey } from "@/lib/utils";

const COMPANY_TONE: Record<CompanyStatus, "green" | "amber" | "gray"> = { active: "green", suspendue: "amber", terminee: "gray" };

export function CompanyStatusBadge({ status }: { status: CompanyStatus }) {
  return (
    <Badge tone={COMPANY_TONE[status]} dot>
      {COMPANY_STATUS_LABEL[status]}
    </Badge>
  );
}

/** Facture non payée dont l'échéance est passée */
export function isOverdue(i: Pick<CompanyInvoice, "status" | "due_on">) {
  return (i.status === "a_envoyer" || i.status === "envoyee") && i.due_on < dayKey();
}

export function isUnpaid(i: Pick<CompanyInvoice, "status">) {
  return i.status === "a_envoyer" || i.status === "envoyee";
}

export function InvoiceStatusBadge({ invoice }: { invoice: Pick<CompanyInvoice, "status" | "due_on"> }) {
  if (isOverdue(invoice)) {
    return (
      <Badge tone="red" dot>
        En retard
      </Badge>
    );
  }
  const tone = invoice.status === "payee" ? "green" : invoice.status === "envoyee" ? "brand" : invoice.status === "a_envoyer" ? "amber" : "gray";
  return (
    <Badge tone={tone} dot>
      {INVOICE_STATUS_LABEL[invoice.status]}
    </Badge>
  );
}
