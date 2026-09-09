const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

/** Pie de pagina compartido: marca + contacto de soporte. */
export function AppFooter() {
  return (
    <footer className="border-t border-white/10 px-6 py-4 text-center text-xs text-stone-600">
      <p>
        Lumen — Inteligencia Patrimonial
        {SUPPORT_EMAIL && (
          <>
            {' · '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-stone-500 hover:text-gold">
              {SUPPORT_EMAIL}
            </a>
          </>
        )}
      </p>
    </footer>
  );
}
