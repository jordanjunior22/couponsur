import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/utils/ConnectDb";
import { getSessionUser } from "@/utils/session";
import UserModel from "@/models/Users";
import BetTypeModel from "@/models/BetType";

const STANDARD_BET_TYPES = [
  {
    code: "1X2",
    label: "Vainqueur du match",
    description: "Prédire: Victoire à domicile (1), Nul (X), ou Victoire à l'extérieur (2)",
    category: "MATCH_RESULT",
    predictions: ["1", "X", "2"],
    isActive: true,
  },
  {
    code: "DOUBLE_CHANCE",
    label: "Double Chance",
    description: "Choisir deux résultats: 1X (Domicile ou Nul), 12 (Domicile ou Extérieur), X2 (Nul ou Extérieur)",
    category: "MATCH_RESULT",
    predictions: ["1X", "12", "X2"],
    isActive: true,
  },
  {
    code: "BTTS",
    label: "Les deux équipes marquent",
    description: "Les deux équipes marqueront-elles dans le match?",
    category: "GOALS",
    predictions: ["OUI", "NON"],
    isActive: true,
  },
  {
    code: "OVER_UNDER",
    label: "Plus/Moins de buts",
    description: "Total de buts supérieur ou inférieur à 2.5",
    category: "GOALS",
    predictions: ["PLUS_2.5", "MOINS_2.5"],
    isActive: true,
  },
  {
    code: "HANDICAP_ASIAN",
    label: "Handicap asiatique",
    description: "L'équipe doit gagner avec handicap (ex: -1, -1.5, +1)",
    category: "MATCH_RESULT",
    predictions: ["-2", "-1.5", "-1", "+1", "+1.5", "+2"],
    isActive: true,
  },
  {
    code: "HANDICAP_EUROPE",
    label: "Handicap européen",
    description: "Handicap fixe appliqué au résultat du match",
    category: "MATCH_RESULT",
    predictions: ["-2", "-1", "0", "+1", "+2"],
    isActive: true,
  },
  {
    code: "CORRECT_SCORE",
    label: "Score exact",
    description: "Prédire le score exact final (ex: 1-0, 2-1)",
    category: "OTHER",
    predictions: ["0-0", "1-0", "0-1", "1-1", "2-0", "0-2", "2-1", "1-2", "2-2", "3-0", "0-3", "3-1", "1-3"],
    isActive: true,
  },
  {
    code: "FIRST_SCORER",
    label: "Premier buteur",
    description: "Quel joueur marquera le premier? (Entrer le nom du joueur)",
    category: "PLAYERS",
    predictions: ["TEXTE_LIBRE"],
    isActive: true,
  },
  {
    code: "CORNERS",
    label: "Corners",
    description: "Total de corners au-dessus ou en-dessous d'un certain nombre",
    category: "OTHER",
    predictions: ["PLUS_8", "MOINS_8", "PLUS_10", "MOINS_10"],
    isActive: true,
  },
  {
    code: "CARDS",
    label: "Cartons totaux",
    description: "Total des cartons jaunes et rouges du match",
    category: "OTHER",
    predictions: ["PLUS_3", "MOINS_3", "PLUS_5", "MOINS_5"],
    isActive: true,
  },
  {
    code: "CUSTOM",
    label: "Pari personnalisé",
    description: "Prédiction personnalisée définie par l'utilisateur",
    category: "OTHER",
    predictions: ["TEXTE_LIBRE"],
    isActive: true,
  },
];

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await UserModel.findById(sessionUser._id);

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check if any bet types already exist
    const existingCount = await BetTypeModel.countDocuments();
    if (existingCount > 0) {
      return NextResponse.json({
        success: false,
        message: "Bet types already initialized. Delete existing ones first.",
      });
    }

    // Create all standard bet types
    const created = await BetTypeModel.insertMany(STANDARD_BET_TYPES);

    return NextResponse.json({
      success: true,
      message: `${created.length} standard bet types initialized`,
      data: created,
    });
  } catch (error: any) {
    console.error("Initialize bet types error:", error);
    return NextResponse.json(
      { error: "Failed to initialize bet types" },
      { status: 500 }
    );
  }
}
