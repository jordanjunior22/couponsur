# 🔍 Guide de Debug - Accès Admin Dashboard

Si tu es redirigé vers home en tant qu'admin, suis ce guide:

## **Step 1: Vérifier le token JWT**

Ouvre les DevTools (F12) → Application/Storage → Cookies → cherche "token"

Copie la valeur du token et teste cet endpoint:

```bash
# Terminal
curl http://localhost:3000/api/auth/debug \
  -H "Cookie: token=TON_TOKEN_JWT"
```

Tu devrais voir:
```json
{
  "token_present": true,
  "token_decoded": {
    "userId": "...",
    "role": "ADMIN"
  },
  "token_content": {
    "userId": "...",
    "role": "ADMIN"
  }
}
```

**Si `role` n'est pas "ADMIN"**, c'est que ton user n'est pas admin en DB.

---

## **Step 2: Vérifier l'API /auth/me**

```bash
curl http://localhost:3000/api/auth/me \
  -H "Cookie: token=TON_TOKEN_JWT" \
  -s | jq '.user.role'
```

Tu devrais voir: `"ADMIN"`

**Si tu reçois `"USER"`**, alors ton user est créé en tant que USER au lieu de ADMIN.

---

## **Step 3: Créer un Admin Manuellement**

Si le problème vient du user créé en tant que USER, crée un nouvel admin directement en DB:

```javascript
// MongoDB console
use your_database_name

db.users.insertOne({
  phone: "237600000000",
  password: "$2a$10/...", // bcrypt hash du mot de passe
  role: "ADMIN",
  unlockedPickIds: [],
  createdAt: new Date(),
  updatedAt: new Date()
})
```

Ou via MongoDB Compass:
1. Ouvre la collection `users`
2. Insert one document:
```json
{
  "phone": "237600000000",
  "password": "bcrypt_hash_here",
  "role": "ADMIN",
  "unlockedPickIds": [],
  "createdAt": ISODate("2026-05-01T00:00:00Z"),
  "updatedAt": ISODate("2026-05-01T00:00:00Z")
}
```

---

## **Step 4: Générer un Hash Bcrypt**

Pour générer le hash du mot de passe, utilise Node:

```bash
# Terminal
node -e "
const bcrypt = require('bcryptjs');
bcrypt.hash('tonmotdepasse123', 10, (err, hash) => {
  console.log(hash);
});
"
```

Copie le hash et utilise-le dans MongoDB.

---

## **Step 5: Tester la Connexion**

1. Logout complètement (vide les cookies)
2. Connecte-toi avec ton nouveau compte admin
3. Va à `/dashboard`

Tu devrais voir le dashboard complet.

---

## **Checklist**

- [ ] Token JWT contient `"role": "ADMIN"`
- [ ] `/auth/me` retourne `"role": "ADMIN"`
- [ ] User en DB a `role: "ADMIN"`
- [ ] Dashboard est accessible

---

## **Astuce Rapide**

Si tu es déjà connecté en tant qu'admin, regarde dans la console du navigateur:

```javascript
// Dans la console
fetch('/api/auth/me').then(r => r.json()).then(d => console.log(d.user.role))
```

Tu devrais voir `ADMIN` dans la console.

---

**Besoin d'aide?** Check les logs de ta DB et de Next.js (terminal où tu as lancé `npm run dev`)
