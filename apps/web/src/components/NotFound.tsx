import { ButtonLink } from "~/components/ui/Button.tsx";
import { Card } from "~/components/ui/Card.tsx";
import { useT } from "~/lib/i18n.tsx";

/** Any address the router does not know: said in the UI language, with a way back (W14). */
export function NotFound() {
  const t = useT();
  return (
    <Card className="mx-auto max-w-md text-center" data-testid="not-found">
      <h1 className="mb-2 font-display text-2xl font-bold text-indigo">
        {t("common.notFoundTitle")}
      </h1>
      <p className="mb-5 text-mist">{t("common.notFoundBody")}</p>
      <ButtonLink to="/" variant="indigo">
        {t("common.backHome")}
      </ButtonLink>
    </Card>
  );
}
