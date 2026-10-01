# Comece por aqui

O ZIP tem uma única pasta com todo o projeto.

Abra `INSTALACAO_CLOUDFLARE.html` no navegador ou leia `INSTALACAO_CLOUDFLARE.md` para o processo completo. `SISTEMAS_IMPLEMENTADOS.md` descreve o modo estratégico e seus limites; `VALIDACAO.md` registra os checks executados.

Publicação inicial, depois de instalar Node 24.19.0:

```sh
npm ci
npm run configure:cloudflare -- meu-openfront
npm run build:cloudflare
npx wrangler login
npx wrangler pages project create meu-openfront --production-branch main
npm run deploy:backend
npm run deploy:pages
```

Substitua `meu-openfront` por um nome disponível. O resultado usa um Pages para o site e um Worker com Durable Objects para o multiplayer. Os jogadores usam um só endereço, o do Pages.

Para as atualizações seguintes:

```sh
npm run deploy:cloudflare
```

Este pacote está preparado para deploy; ainda precisa ser publicado e testado na sua conta Cloudflare.
