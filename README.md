# sharp-or-larp

Donne un lien GitHub, le LARP meter dit si la personne est sharp ou si elle larp, en % de larp.

## Lancer en local

Prérequis : Node.js 22.12 ou plus.

```bash
npm install
npm run cf-typegen
npm run dev
```

Le site tourne sur `http://localhost:5173`. Le front React et le Worker démarrent ensemble.

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance le site et le serveur en local |
| `npm run lint` | Vérifie le code sans l'exécuter |
| `npm run cf-typegen` | Régénère les types Cloudflare après un changement de `wrangler.jsonc` |
| `npm run deploy` | Construit et met en ligne sur Cloudflare |

## Arborescence

```
├── src/                      Front React (navigateur)
│   ├── main.tsx              Point d'entrée : affiche <App /> dans index.html
│   └── App.tsx               Composant racine de la page
├── worker/                   Serveur (Cloudflare Worker)
│   └── main.ts               Le menu de l'API : déclare les routes /api/*
├── public/                   Fichiers servis tels quels (favicon, icônes)
├── index.html                Page d'entrée du site
├── wrangler.jsonc            Config Cloudflare : /api/* va au Worker, le reste au site
├── worker-configuration.d.ts Types Cloudflare générés par cf-typegen, ne pas modifier
├── vite.config.ts            Vite + plugins React et Cloudflare
├── tsconfig.json             Relie les trois configs TypeScript :
│   tsconfig.app.json           pour src/ (navigateur)
│   tsconfig.worker.json        pour worker/ (Cloudflare)
│   tsconfig.node.json          pour vite.config.ts
├── eslint.config.js          Règles du linter
└── package.json              Dépendances et commandes npm
```
