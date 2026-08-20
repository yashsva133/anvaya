export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    mode: "demo",
    database: "not-configured",
  });
}
