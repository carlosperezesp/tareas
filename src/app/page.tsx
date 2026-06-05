import { getSession } from "@/lib/auth";
import { AppClient } from "./app-client";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="login-page">
        <section className="login-sheet">
          <p className="kicker">Edicion diaria</p>
          <h1>La Lista</h1>
          <p>
            Entra con Google para sincronizar tus tareas en todos tus dispositivos y dejar que
            la app cree bloques en Calendar.
          </p>
          <a className="login-button" href="/api/auth/google">
            Entrar con Google
          </a>
        </section>
      </main>
    );
  }

  return <AppClient userEmail={session.email} userName={session.name} />;
}
