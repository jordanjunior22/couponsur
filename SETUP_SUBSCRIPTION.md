# 🎯 Guide de Configuration - Système d'Abonnement

Ce guide explique comment mettre en place le nouveau système d'abonnement mensuel.

## 📋 Étapes de Configuration

### **1. Initialiser les Types de Pronostics (BetTypes)**

Avant toute chose, créez les types de pronostics standards:

```bash
# Via curl (requiert authentification admin)
curl -X POST http://localhost:3000/api/admin/bet-types/init \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_ADMIN_JWT_TOKEN"
```

Ou via l'UI admin (une fois connecté):
1. Allez à **Dashboard > Paramètres > Types de pronostics**
2. Les 11 types standards seront pré-configurés:
   - **1X2** (Winner, Draw, Away)
   - **DOUBLE_CHANCE** (1X, 12, X2)
   - **BTTS** (Yes/No)
   - **OVER_UNDER** (Totals)
   - **HANDICAP_ASIAN** (Handicap asiatique)
   - **HANDICAP_EUROPE** (Handicap européen)
   - **CORRECT_SCORE** (Score exact)
   - **FIRST_SCORER** (Buteur)
   - **CORNERS** (Corners)
   - **CARDS** (Cartons)
   - **CUSTOM** (Personnalisé)

### **2. Initialiser les Plans d'Abonnement**

```bash
# Via curl
curl -X POST http://localhost:3000/api/admin/subscription-plans/init \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_ADMIN_JWT_TOKEN"
```

Les 4 plans seront créés:
- **1 Month**: 80,000 FCFA
- **3 Months**: 64,000 FCFA (-20%)
- **6 Months**: 60,000 FCFA (-25%)
- **1 Year**: 56,000 FCFA (-30%)

### **3. Ajuster les Plans (Optionnel)**

Allez à **Dashboard > Paramètres > Plans d'abonnement** pour:
- Modifier les prix
- Changer les pourcentages de réduction
- Désactiver des plans
- Ajouter des descriptions personnalisées

### **4. Mettre à Jour les Modèles de Picks**

Les anciens picks ont la structure:
```typescript
matches: [
  { prediction: "PSG vs Lyon — BTTS: Yes", outcome: "PENDING" }
]
```

Les nouveaux picks doivent avoir:
```typescript
matches: [
  {
    matchId: "PSG_vs_Lyon_2026-05-10",
    teams: { home: "PSG", away: "Lyon" },
    betTypeCode: "BTTS",  // Reference to BetType
    prediction: "YES",
    outcome: "PENDING"
  }
]
```

**Important**: Les anciens picks continueront à fonctionner, mais il est recommandé de les mettre à jour progressivement via l'admin dashboard.

## 🔑 Clés Environnement Requises

S'assurer que `.env` contient:
```
JWT_SECRET=your_secret_key
DATABASE_URL=your_mongodb_url
```

## 📱 Flux Utilisateur

### **1. Nouvel Utilisateur**
1. S'inscrit via `/auth/signup`
2. Redirigé automatiquement à `/billing`
3. Sélectionne un plan et effectue le paiement (Fapshi)
4. Subscription activée après confirmation Fapshi
5. Accès aux picks

### **2. Utilisateur Existant**
1. Se connecte via `/auth/login`
2. Si pas d'abonnement actif → Redirigé à `/billing`
3. Sélectionne un plan et paye
4. Accès aux picks

### **3. Abonnement Expiré**
1. À l'expiration de `subscription.endDate`
2. Utilisateur redirigé à `/billing` au prochain accès
3. Peut renouveler son abonnement

## 🔌 Intégration Fapshi (Webhook)

Le webhook de paiement doit être configuré dans Fapshi pour pointer à:
```
POST /api/subscription/webhook
```

Corps attendu:
```json
{
  "transId": "FAPSHI_TRANSACTION_ID",
  "status": "SUCCESSFUL",
  "externalId": "SUBSCRIPTION_PLAN_ID"
}
```

## 📊 Structures de Données

### **Users (modifié)**
```typescript
{
  phone: string,
  password: string,
  role: "USER" | "ADMIN",
  subscription?: {
    planId: ObjectId,
    startDate: Date,
    endDate: Date,
    status: "active" | "cancelled" | "expired"
  },
  unlockedPickIds: ObjectId[], // Backward compatible
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### **SubscriptionPlan (nouveau)**
```typescript
{
  name: string,
  durationDays: number,  // 30 | 90 | 180 | 365
  basePrice: number,
  discountPercent: number,
  finalPrice: number,  // Calculé automatiquement
  description: string,
  displayOrder: number,
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### **BetType (nouveau)**
```typescript
{
  code: string,  // "1X2", "BTTS", etc.
  label: string,
  description: string,
  category: "MATCH_RESULT" | "GOALS" | "PLAYERS" | "OTHER",
  predictions: string[],  // ["1", "X", "2"]
  isActive: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### **SubscriptionPayment (nouveau)**
```typescript
{
  userId: ObjectId,
  planId: ObjectId,
  phone: string,
  amount: number,
  fapshiTransId: string,
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED",
  subscriptionStartDate?: Date,
  subscriptionEndDate?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## 🛂 Middleware de Redirection

Le fichier `middleware.ts` gère automatiquement:
- Redirection des utilisateurs non-abonnés vers `/billing`
- Protection des routes admin
- Accès public à `/billing`, `/auth/*`, etc.

## ✅ Checklist de Déploiement

- [ ] Exécuter `/api/admin/bet-types/init`
- [ ] Exécuter `/api/admin/subscription-plans/init`
- [ ] Configurer webhook Fapshi
- [ ] Tester le flux complet (inscription → paiement → accès)
- [ ] Vérifier la redirection automatique vers `/billing`
- [ ] Tester l'expiration d'abonnement
- [ ] Mettre à jour les anciens picks (optionnel mais recommandé)

## 🐛 Dépannage

### **Les utilisateurs ne sont pas redirigés vers /billing**
- Vérifier le middleware.ts est dans la racine du projet
- Redémarrer le serveur Next.js
- Vérifier que `hasActiveSubscription` est correctement hydraté dans AuthContext

### **Paiement accepté mais subscription non activée**
- Vérifier le webhook Fapshi
- Vérifier les logs de `/api/subscription/webhook`
- S'assurer que `fapshiTransId` est unique

### **Les anciens users continuent d'accéder sans subscription**
- Modifier le `middleware.ts` pour ajouter un `unlockedPickIds` check temporaire:
```typescript
const hasOldUnlockedPicks = sessionUser.unlockedPickIds && sessionUser.unlockedPickIds.length > 0;
if (sessionUser.role === "USER" && !sessionUser.hasActiveSubscription && !hasOldUnlockedPicks) {
  return NextResponse.redirect(new URL("/billing", request.url));
}
```

---

**Prochaines étapes**: Implémenter l'interface de création/modification des picks avec sélection de BetTypes.
