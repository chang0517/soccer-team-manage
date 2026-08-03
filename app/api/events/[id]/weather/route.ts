import { getEvent } from "@/lib/db";
import { getMatchWeather } from "@/lib/weather";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const event = await getEvent(Number(id));
  if (!event) return Response.json({ error: "not found" }, { status: 404 });

  const weather =
    event.type === "match"
      ? await getMatchWeather(event.location, event.date, event.time)
      : null;
  return Response.json({ weather });
}
