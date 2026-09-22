import { createFileRoute } from "@tanstack/react-router";
import { FinancialDashboard } from "@/components/financial-dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vantage — Financial Dashboard" },
      {
        name: "description",
        content:
          "Financial dashboard: track income, expenses, budgets, portfolio allocation, and recent transactions.",
      },
      { property: "og:title", content: "Vantage — Financial Dashboard" },
      {
        property: "og:description",
        content:
          "Financial dashboard: track income, expenses, budgets, portfolio allocation, and recent transactions.",
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
