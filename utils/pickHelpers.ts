interface Pick {
  _id: string;
  match_date: string;
  [key: string]: any;
}

interface GroupedPicks {
  date: string;
  displayDate: string;
  picks: Pick[];
}

export function getDateKey(dateString: string): string {
  if (!dateString) return "";
  const dateOnly = dateString.split("T")[0];
  return dateOnly;
}

export function formatDateDisplay(dateString: string): string {
  if (!dateString) return "—";
  const dateOnly = dateString.split("T")[0];
  const date = new Date(dateOnly + "T12:00:00");

  const dayName = date.toLocaleDateString("fr-FR", { weekday: "long" });
  const dayNum = date.getDate();
  const monthName = date.toLocaleDateString("fr-FR", { month: "long" });

  return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${dayNum} ${monthName}`;
}

export function groupPicksByDate(picks: Pick[]): GroupedPicks[] {
  const grouped = new Map<string, Pick[]>();

  picks.forEach((pick) => {
    const dateKey = getDateKey(pick.match_date);
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(pick);
  });

  const result: GroupedPicks[] = [];
  const sortedDates = Array.from(grouped.keys()).sort().reverse();

  sortedDates.forEach((dateKey) => {
    result.push({
      date: dateKey,
      displayDate: formatDateDisplay(dateKey + "T12:00:00"),
      picks: grouped.get(dateKey) || [],
    });
  });

  return result;
}
