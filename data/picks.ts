// ─── Types ────────────────────────────────────────────────────────────────────
export interface Match {
  id: string;
  prediction: string;
  outcome: "PENDING" | "WIN" | "LOSS";
}

export interface Pick {
  _id: string;
  title: string;
  price: number;
  total_odds: number;
  match_date: string;
  league: string;
  outcome: "PENDING" | "WIN" | "LOSS";
  is_published: boolean;
  matches: Match[];
}

// ─── Data ─────────────────────────────────────────────────────────────────────
export const MOCK_PICKS: Pick[] = [
  {
    _id: "1",
    title: "Serie A Weekend Super Combo",
    price: 4900,
    total_odds: 5.4,
    match_date: "2026-04-18",
    league: "Serie A",
    outcome: "PENDING",
    is_published: true,
    matches: [
      { id: "m1", prediction: "Juventus vs Milan — Over 1.5 Goals", outcome: "WIN" },
      { id: "m2", prediction: "Inter vs Roma — Inter to Win", outcome: "PENDING" },
      { id: "m3", prediction: "Napoli vs Atalanta — Over 2.5", outcome: "PENDING" },
      { id: "m4", prediction: "Lazio vs Torino — BTTS: Yes", outcome: "PENDING" },
    ],
  },
  {
    _id: "2",
    title: "Ligue 1 — Sunday Night",
    price: 3500,
    total_odds: 3.2,
    match_date: "2026-04-18",
    league: "Ligue 1",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m5", prediction: "PSG vs Lyon — BTTS: Yes", outcome: "WIN" },
      { id: "m6", prediction: "Monaco vs Lille — Over 2.5 Goals", outcome: "WIN" },
      { id: "m7", prediction: "Marseille vs Rennes — Home Win", outcome: "WIN" },
    ],
  },
  {
    _id: "3",
    title: "PL Banker of the Week",
    price: 5500,
    total_odds: 2.1,
    match_date: "2026-04-14",
    league: "Premier League",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m8", prediction: "Man City vs Fulham — Man City (-1.5)", outcome: "WIN" },
      { id: "m9", prediction: "Arsenal vs Wolves — Over 1.5", outcome: "WIN" },
      { id: "m10", prediction: "Tottenham vs Everton — Home Win", outcome: "WIN" },
    ],
  },
  {
    _id: "4",
    title: "La Liga Value Bet",
    price: 2500,
    total_odds: 4.5,
    match_date: "2026-04-12",
    league: "La Liga",
    outcome: "LOSS",
    is_published: true,
    matches: [
      { id: "m11", prediction: "Real Madrid vs Sevilla — BTTS: No", outcome: "LOSS" },
      { id: "m12", prediction: "Barcelona vs Villarreal — Over 2.5", outcome: "WIN" },
      { id: "m13", prediction: "Betis vs Sociedad — Away Win", outcome: "LOSS" },
    ],
  },
  {
    _id: "5",
    title: "Bundesliga Goal Fest",
    price: 2000,
    total_odds: 1.9,
    match_date: "2026-04-10",
    league: "Bundesliga",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m14", prediction: "Dortmund vs Leverkusen — Over 3.5", outcome: "WIN" },
      { id: "m15", prediction: "Bayern vs Stuttgart — Over 2.5", outcome: "WIN" },
      { id: "m16", prediction: "Leipzig vs Freiburg — BTTS", outcome: "WIN" },
    ],
  },
  {
    _id: "6",
    title: "Serie A Tactical Selection",
    price: 3200,
    total_odds: 3.8,
    match_date: "2026-04-05",
    league: "Serie A",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m17", prediction: "Napoli vs Lazio — Home Win", outcome: "WIN" },
      { id: "m18", prediction: "Fiorentina vs Bologna — Over 2.5", outcome: "WIN" },
      { id: "m19", prediction: "Inter vs Genoa — Clean Sheet Yes", outcome: "WIN" },
    ],
  },
  {
    _id: "7",
    title: "Eredivisie Corners Special",
    price: 1500,
    total_odds: 2.2,
    match_date: "2026-04-02",
    league: "Eredivisie",
    outcome: "LOSS",
    is_published: true,
    matches: [
      { id: "m20", prediction: "Ajax vs PSV — Over 9.5 Corners", outcome: "LOSS" },
      { id: "m21", prediction: "Feyenoord vs AZ — Over 8.5 Corners", outcome: "WIN" },
      { id: "m22", prediction: "Utrecht vs Twente — Over 2.5", outcome: "LOSS" },
    ],
  },
  {
    _id: "8",
    title: "Champions League Combo",
    price: 6000,
    total_odds: 6.0,
    match_date: "2026-03-28",
    league: "UCL",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m23", prediction: "Real Madrid vs Bayern — X2", outcome: "WIN" },
      { id: "m24", prediction: "Arsenal vs PSG — Over 2.5", outcome: "WIN" },
      { id: "m25", prediction: "Inter vs Barca — BTTS", outcome: "WIN" },
      { id: "m26", prediction: "City vs Atletico — Home Win", outcome: "WIN" },
    ],
  },
  {
    _id: "9",
    title: "MLS Sunday Acca",
    price: 1200,
    total_odds: 1.5,
    match_date: "2026-03-25",
    league: "MLS",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m27", prediction: "LA Galaxy vs LAFC — Home Win", outcome: "WIN" },
      { id: "m28", prediction: "Inter Miami vs NYCFC — Over 2.5", outcome: "WIN" },
      { id: "m29", prediction: "Seattle vs Austin — BTTS", outcome: "WIN" },
    ],
  },
  {
    _id: "10",
    title: "Ligue 1 Low Risk",
    price: 2800,
    total_odds: 2.8,
    match_date: "2026-03-20",
    league: "Ligue 1",
    outcome: "LOSS",
    is_published: true,
    matches: [
      { id: "m30", prediction: "Nice vs Lens — Under 2.5", outcome: "LOSS" },
      { id: "m31", prediction: "PSG vs Nantes — Home Win", outcome: "WIN" },
      { id: "m32", prediction: "Lyon vs Reims — Over 1.5", outcome: "LOSS" },
    ],
  },
  {
    _id: "11",
    title: "Premier League Banker",
    price: 4000,
    total_odds: 3.1,
    match_date: "2026-03-15",
    league: "Premier League",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m33", prediction: "Liverpool vs Chelsea — Home Win", outcome: "WIN" },
      { id: "m34", prediction: "Man United vs Burnley — Over 1.5", outcome: "WIN" },
      { id: "m35", prediction: "Brighton vs Palace — BTTS", outcome: "WIN" },
    ],
  },
  {
    _id: "12",
    title: "Serie B — Promotions",
    price: 1800,
    total_odds: 2.5,
    match_date: "2026-03-10",
    league: "Serie A",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m36", prediction: "Palermo vs Parma — Over 2.5", outcome: "WIN" },
      { id: "m37", prediction: "Como vs Bari — Home Win", outcome: "WIN" },
      { id: "m38", prediction: "Sampdoria vs Pisa — BTTS", outcome: "WIN" },
    ],
  },
  {
    _id: "13",
    title: "La Liga Late Night",
    price: 2200,
    total_odds: 2.9,
    match_date: "2026-03-05",
    league: "La Liga",
    outcome: "LOSS",
    is_published: true,
    matches: [
      { id: "m39", prediction: "Valencia vs Girona — Away Win", outcome: "LOSS" },
      { id: "m40", prediction: "Osasuna vs Getafe — Under 2.5", outcome: "WIN" },
      { id: "m41", prediction: "Almeria vs Cadiz — Over 2.5", outcome: "LOSS" },
    ],
  },
  {
    _id: "14",
    title: "Bundesliga BTTS",
    price: 2100,
    total_odds: 2.0,
    match_date: "2026-03-01",
    league: "Bundesliga",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m42", prediction: "Leipzig vs Frankfurt — BTTS: Yes", outcome: "WIN" },
      { id: "m43", prediction: "Union Berlin vs Mainz — BTTS", outcome: "WIN" },
      { id: "m44", prediction: "Koln vs Augsburg — BTTS", outcome: "WIN" },
    ],
  },
  {
    _id: "15",
    title: "UCL Semi-Finals",
    price: 7000,
    total_odds: 5.5,
    match_date: "2026-02-25",
    league: "UCL",
    outcome: "WIN",
    is_published: true,
    matches: [
      { id: "m45", prediction: "Man City vs Real Madrid — Home Win", outcome: "WIN" },
      { id: "m46", prediction: "Bayern vs PSG — Over 2.5", outcome: "WIN" },
      { id: "m47", prediction: "Inter vs Arsenal — BTTS", outcome: "WIN" },
      { id: "m48", prediction: "Barcelona vs Napoli — Home Win", outcome: "WIN" },
    ],
  },
];