This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies:
```bash
npm install
```

Then, run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 🛠️ Next.js 16 Configuration (Proxy)
Este projeto utiliza Next.js 16 (Turbopack). A convenção `middleware.ts` foi substituída por `src/proxy.ts`.
Certifique-se de que `src/proxy.ts` exporta uma função chamada `proxy`:
```typescript
export async function proxy(req: NextRequest) { ... }
```

### 🗄️ Database Connectivity
Para rodar localmente e conectar ao banco da VPS, certifique-se de que a porta 5432 está acessível ou utilize um túnel SSH:
```bash
ssh -L 5432:localhost:5432 root@187.77.43.141
```
No `.env`, use `DATABASE_URL=postgresql://user:pass@localhost:5432/mission_control`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
