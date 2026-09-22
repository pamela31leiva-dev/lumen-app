import { createFileRoute } from "@tanstack/react-router";
import { FinancialDashboard } from "@/components/financial-dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lumen — Centro de Inteligencia Patrimonial" },
      {
        name: "description",
        content:
          "Consolida, comprende y gestiona tu patrimonio con claridad privada y precisión financiera.",
      },
      { property: "og:title", content: "Lumen — Centro de Inteligencia Patrimonial" },
      {
        property: "og:description",
        content:
          "Consolida, comprende y gestiona tu patrimonio con claridad privada y precisión financiera.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <FinancialDashboard />;
}
