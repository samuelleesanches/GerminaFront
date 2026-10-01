# Instalação no Cloudflare — OpenFront

Este pacote contém uma única pasta, `OpenFront-Cloudflare`, com frontend, backend, mapas, código-fonte, testes e arquivos de configuração. O frontend compilado fica em `static/`.

## Uma pasta, dois projetos no Cloudflare

É possível entregar tudo em um ZIP e manter tudo no mesmo repositório. O multiplayer, porém, precisa de **um projeto Worker e um projeto Pages**.

O Pages hospeda o site e uma pequena função que encaminha as chamadas ao backend. O Worker mantém o diretório de salas e um Durable Object por sala, com WebSockets e histórico persistente de turnos. A Cloudflare exige que as classes de Durable Objects sejam implantadas em um Worker: elas não podem ser criadas e implantadas no próprio projeto Pages.

Os jogadores acessam somente o endereço do Pages. O binding `BACKEND` liga os dois projetos internamente. Não é necessário colocar a URL pública do Worker no JavaScript do navegador.

| Parte                            | Arquivo de configuração                     | Destino                                    |
| -------------------------------- | ------------------------------------------- | ------------------------------------------ |
| Frontend, mapas e gateway        | `wrangler.jsonc`                            | Cloudflare Pages                           |
| Salas, WebSockets e persistência | `wrangler.backend.jsonc`                    | Cloudflare Worker + Durable Objects SQLite |
| Gateway do Pages                 | `cloudflare/pages.ts` → `static/_worker.js` | Pages Functions, modo avançado             |
| Backend                          | `src/cloudflare/worker.ts`                  | Worker                                     |

O servidor Node original continua em `src/server/`, para desenvolvimento convencional. O deploy Cloudflare usa a adaptação em `src/cloudflare/`; não tenta iniciar Express, processos Node ou o comando `npm start` no Pages.

Referência oficial: https://developers.cloudflare.com/pages/functions/bindings/#durable-objects

## 1. Preparar o computador

Você precisa de uma conta Cloudflare e de **Node.js 24.19.0**, que inclui npm 11.9.0. O projeto aceita Node 24 a partir de 24.15.0 e npm 11.9 a 12. O arquivo `.nvmrc` fixa a versão usada na validação.

1. Extraia o ZIP.
2. Abra o terminal dentro da pasta `OpenFront-Cloudflare`, onde está `package.json`.
3. Confira as versões e instale as dependências:

```sh
node --version
npm --version
npm ci
```

Esses comandos funcionam no PowerShell, no macOS e no Linux. O Wrangler já está nas dependências: não precisa instalá-lo globalmente. `node_modules` não está no ZIP e será criado por `npm ci`.

## 2. Escolher os nomes dos projetos

Use um nome disponível na sua conta. No exemplo, o Pages se chama `meu-openfront` e o Worker, `meu-openfront-backend`:

```sh
npm run configure:cloudflare -- meu-openfront
```

O comando atualiza os dois arquivos Wrangler, o service binding e as origens permitidas. Ele não publica nada.

O endereço esperado é `https://meu-openfront.pages.dev`. Se a Cloudflare atribuir outro hostname porque o nome já está ocupado, coloque o endereço efetivo em `ALLOWED_ORIGINS`, em `wrangler.backend.jsonc`, e publique novamente o Worker.

Para permitir também um domínio próprio:

```sh
npm run configure:cloudflare -- meu-openfront https://jogo.seudominio.com
```

O comando recebe URLs HTTPS completas. Ele mantém também as origens `http://localhost:8788` e `http://127.0.0.1:8788`, para testes locais.

## 3. Compilar o pacote

```sh
npm run build:cloudflare
```

Esse comando verifica o TypeScript, compila o jogo, copia os mapas e gera:

- `static/index.html`, com a configuração do navegador já preenchida;
- `static/_worker.js`, o gateway do Pages;
- `static/_routes.json`, com as rotas de API, salas e links de convite;
- `static/_headers`, com as regras de cache;
- assets, idiomas, sons, fontes e mapas usados pelo frontend.

O build calcula automaticamente um `BUILD_ID` e o grava no frontend e em `wrangler.backend.jsonc`. Os dois deploys precisam usar essa mesma compilação. Não edite o identificador manualmente.

O ZIP já inclui um build. Execute o comando novamente depois de alterar o código ou ativar Turnstile. Alterar somente nomes de projetos e origens com `configure:cloudflare` não exige recompilar o JavaScript, porque o acesso ao backend usa a origem do site.

## 4. Autenticar e criar o Pages

```sh
npx wrangler login
npx wrangler pages project create meu-openfront --production-branch main
```

O login abre o navegador para autorizar o Wrangler na sua conta. Se você tiver várias contas Cloudflare, selecione a mesma conta para os dois projetos. Se o Pages já existir com esse nome, pule somente o comando de criação.

Este caminho cria um projeto **Direct Upload**. A Cloudflare não permite convertê-lo depois para Git integration; para isso, crie outro projeto com integração Git. A alternativa Git está descrita abaixo.

## 5. Publicar primeiro o Worker

```sh
npm run deploy:backend
```

O Wrangler publica o backend e aplica a migração `v1`, criando os namespaces SQLite das classes `GameRoom` e `LobbyDirectory`.

Não é necessário criar D1, R2, KV ou um banco externo. Não remova ou renomeie a migração `v1` depois da primeira publicação. Para futuras mudanças no armazenamento, adicione novas migrações.

No painel **Workers & Pages**, confira o Worker `meu-openfront-backend` e seus bindings:

| Binding     | Classe           |
| ----------- | ---------------- |
| `ROOMS`     | `GameRoom`       |
| `DIRECTORY` | `LobbyDirectory` |

As variáveis `BUILD_ID` e `ALLOWED_ORIGINS` são fornecidas pelo arquivo Wrangler. O backend funciona no modo de convidados, sem chave da API oficial do OpenFront.

## 6. Publicar o frontend no Pages

```sh
npm run deploy:pages
```

Esse comando envia o conteúdo de `static/` para a branch de produção `main`. Ele lê automaticamente `wrangler.jsonc`, na raiz da pasta.

No projeto Pages, confira em **Settings → Bindings**:

| Tipo            | Nome da variável | Serviço                 |
| --------------- | ---------------- | ----------------------- |
| Service binding | `BACKEND`        | `meu-openfront-backend` |

O binding já está declarado em `wrangler.jsonc`. Se precisar ajustá-lo pelo painel, salve e faça um novo deploy do Pages para que a alteração tenha efeito. Para usar ambientes Preview, configure o binding também nesse ambiente.

Após a configuração inicial, você pode compilar e publicar os dois projetos com:

```sh
npm run deploy:cloudflare
```

Esse comando executa, em sequência: build → Worker → Pages. Ele não cria um Pages inexistente; faça o passo de criação na primeira instalação.

## 7. Conferir a instalação e abrir uma partida

Abra:

```text
https://meu-openfront.pages.dev/api/health
```

A resposta deve conter `ok: true`, `backend: "Durable Objects"` e o `build` atual. Isso confirma que o Pages alcança o Worker.

Depois:

1. Abra `https://meu-openfront.pages.dev` e escolha um nome de jogador.
2. Use **Criar** para abrir uma sala, configure o mapa e o modo estratégico.
3. Copie o link de convite e abra-o em outro navegador ou computador.
4. Inicie a partida pelo navegador do anfitrião.
5. Confirme que ambos veem as mesmas ações. Desconecte e reconecte o segundo jogador para conferir a recuperação dos turnos.

Para testar sozinho, use **Solo**. As salas podem ser divulgadas na lista pública pelo anfitrião. Não há matchmaking ranqueado, contas oficiais, compras ou ranking nesta distribuição: esses serviços dependem da API oficial, ausente no código enviado. Os atalhos principais dessas funções foram ocultados no build Cloudflare.

Cada perfil de navegador recebe um identificador de convidado persistido localmente. Duas abas no mesmo perfil compartilham a identidade; a conexão mais nova substitui a anterior. Para dois jogadores no mesmo computador, use perfis diferentes, outro navegador ou uma janela privada separada.

## Domínio próprio

1. No Pages, abra **Custom domains**, adicione `jogo.seudominio.com` e conclua a configuração DNS indicada pela Cloudflare.
2. Permita a origem no Worker:

```sh
npm run configure:cloudflare -- meu-openfront https://jogo.seudominio.com
npm run deploy:backend
```

3. Abra o site pelo novo domínio e confira `/api/health` e a criação de salas.

Mantenha os endereços que deseja usar em `ALLOWED_ORIGINS`, separados por vírgula. O projeto usa uma lista explícita; não usa `*` para permitir WebSockets de qualquer site.

URLs de preview, como `branch.meu-openfront.pages.dev`, também precisam ser permitidas explicitamente. Para testar uma versão diferente do jogo, use um par separado de projetos Pages/Worker: misturar builds diferentes no mesmo backend gera incompatibilidade de protocolo.

## Alternativa: Pages com integração Git

Se você prefere publicar o frontend automaticamente a cada push, escolha Git integration ao criar o Pages, em vez de Direct Upload.

1. Execute `configure:cloudflare` com os nomes definitivos e envie o conteúdo da pasta para um repositório seu.
2. Conecte esse repositório ao Pages.
3. Configure:

| Campo                            | Valor                                                                      |
| -------------------------------- | -------------------------------------------------------------------------- |
| Framework preset                 | None                                                                       |
| Root directory                   | A pasta que contém `package.json`; vazio se estiver na raiz do repositório |
| Build command                    | `npm run build:cloudflare`                                                 |
| Build output directory           | `static`                                                                   |
| Production branch                | `main`                                                                     |
| Variável de build `NODE_VERSION` | `24.19.0`                                                                  |

O Pages instala as dependências usando o lockfile. O arquivo `.nvmrc` também informa a versão de Node. Confirme que o log mostra Node 24 e npm dentro da faixa aceita pelo projeto.

4. Antes do deploy do frontend, compile e publique o Worker a partir da **mesma revisão de código**:

```sh
npm ci
npm run build:cloudflare
npm run deploy:backend
```

5. Garanta que o binding `BACKEND` aponta para esse Worker.

A integração Git do Pages **não publica o Worker separado automaticamente**. Para automatizar ambos, configure sua própria pipeline com a sequência usada em `deploy:cloudflare`, usando os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. Guarde os valores no serviço de CI, não no repositório. Não use os workflows antigos de publicação do projeto original como configuração da sua conta.

## Por que não arrastar este ZIP inteiro para o painel?

Este ZIP é um pacote de projeto. Ele inclui fontes, testes e configurações, além do build. O Pages precisa receber **o conteúdo de `static/`**, e o Worker precisa de um deploy separado.

A Cloudflare aceita ZIP de assets no fluxo drag and drop, inclusive `_worker.js`, mas esse método tem limite de 1.000 arquivos. Este build inclui mais de 2.000 arquivos por causa dos mapas, idiomas e assets. O Wrangler suporta 20.000 arquivos e é o caminho indicado para este pacote.

O limite por arquivo do Pages é 25 MiB. O build verifica automaticamente esses limites; os assets incluídos cabem neles. Não há necessidade de R2 para os mapas deste pacote.

Portanto, mantenha um só ZIP para distribuir o projeto, extraia-o e use os comandos de deploy. Não envie o código-fonte inteiro como se fosse uma pasta de assets.

## Testar localmente e na rede LAN

Compile primeiro:

```sh
npm ci
npm run build:cloudflare
```

Deixe três terminais abertos na mesma pasta.

**Terminal 1 — backend local:**

```sh
npm run dev:backend:cloudflare
```

**Terminal 2 — Pages local:**

```sh
npm run dev:pages
```

Abra `http://localhost:8788`. O Wrangler resolve o service binding para o Worker local. Os dados locais ficam no armazenamento de desenvolvimento do Wrangler, separados da sua conta em produção.

**Terminal 3 — verificações:**

```sh
npm run test:cloudflare
npm run test:cloudflare:integration
```

O primeiro comando testa estratégia, protocolo, salas, persistência e interface sem abrir servidores. O segundo usa os dois servidores já em execução e testa proxy, criação de sala, WebSockets, início, turnos compartilhados e reconexão. Se Turnstile estiver ativado, esse teste automático de convidados sem CAPTCHA precisa ser executado em um ambiente de teste sem o secret de Turnstile.

Para LAN, os comandos de desenvolvimento já escutam em `0.0.0.0`. Descubra o IP do computador anfitrião, por exemplo `192.168.1.50`, e adicione a origem local em `ALLOWED_ORIGINS` de `wrangler.backend.jsonc`:

```text
http://192.168.1.50:8788
```

Mantenha as demais origens e reinicie o backend local. Libere a porta 8788 no firewall local e abra `http://192.168.1.50:8788` nos demais computadores da mesma rede. O navegador acessa o Pages local; não precisa acessar diretamente a porta 8787.

O servidor Node original também continua disponível com `npm run dev:host`. Esse comando usa a infraestrutura Node/Vite convencional e normalmente abre o frontend na porta 9000; confira o endereço impresso no terminal. A implantação Cloudflare não usa esse comando.

## Turnstile opcional

O pacote vem com Turnstile desativado, permitindo começar sem uma configuração extra. Para ativá-lo:

1. Crie um widget Turnstile e permita os hostnames do seu Pages e domínio próprio.
2. Defina `TURNSTILE_SITE_KEY` no ambiente de build. Em integração Git, use as variáveis do projeto Pages. Para build local no PowerShell:

```powershell
$env:TURNSTILE_SITE_KEY = "SUA_CHAVE_PUBLICA"
npm run build:cloudflare
```

No Linux ou macOS:

```sh
TURNSTILE_SITE_KEY=SUA_CHAVE_PUBLICA npm run build:cloudflare
```

3. Grave o secret no Worker:

```sh
npx wrangler secret put TURNSTILE_SECRET --config wrangler.backend.jsonc
```

4. Publique Worker e Pages e teste uma entrada nova na sala.

A chave pública fica no frontend. O secret fica somente no Worker. Não configure só o secret: sem a chave pública no build, novos jogadores não conseguem apresentar o CAPTCHA necessário.

## Operação, limites e atualizações

- O backend aceita até 32 jogadores por sala, até 48 conexões totais incluindo espectadores e até 100 salas aguardando no diretório. A criação é limitada por identidade de convidado.
- O anfitrião controla o início e as configurações. Salas divulgadas publicamente ficam com configurações congeladas e restrições de moderação do projeto original.
- O histórico de turnos fica no SQLite do Durable Object. A sala expira após duas horas desde a criação, ou após cinco minutos sem conexões depois do início.
- Reconexão recupera jogadores já admitidos. Um jogador novo não entra depois que a partida começou.
- A simulação continua nos Web Workers dos navegadores, de forma determinística. O backend ordena e distribui intenções, salva os turnos e compara hashes enviados pelos clientes. Ele não executa toda a simulação em um servidor autoritativo.
- Os turnos têm intervalo nominal de 100 ms. Alarms de Durable Objects não são um relógio de tempo real: atrasos da plataforma podem reduzir a cadência. A validação de latência com jogadores reais continua necessária antes de abrir o serviço em escala.
- Durable Objects SQLite estão disponíveis nos planos Workers Free e Paid. Partidas ativas geram alarmes e gravações frequentes; não presuma que um serviço multiplayer contínuo caberá nas cotas gratuitas. Acompanhe os limites e o consumo na sua conta.
- Para atualizar o código, rode `npm run deploy:cloudflare`. Mudanças de build encerram as salas antigas, protegendo o protocolo de misturas entre versões. Faça atualizações fora das partidas em andamento. Novos jogadores devem recarregar o site.

O build inclui os recursos originais fornecidos e o modo estratégico integrado. A descrição dos sistemas, das abstrações usadas e dos itens ainda não implementados está em `SISTEMAS_IMPLEMENTADOS.md`.

## Solução de problemas

| Sintoma                               | Verificação e correção                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missing_BACKEND_binding`, HTTP 503   | Confira o service binding `BACKEND` no Pages, o nome do Worker e o ambiente Production/Preview; faça novo deploy do Pages.                         |
| HTTP 403, `origin_not_allowed`        | Adicione o hostname efetivo do site a `ALLOWED_ORIGINS` e publique novamente o Worker. Use a origem completa, com protocolo e porta quando houver. |
| `version_mismatch`, HTTP 409          | Recompile e publique os dois projetos a partir da mesma revisão; recarregue os navegadores e crie uma nova sala.                                   |
| Página abre, multiplayer não funciona | Confira `/api/health`, o binding e o deploy do Worker. Um site com só assets não coordena salas multiplayer.                                       |
| CAPTCHA recusado                      | Confira hostname permitido, chave pública no build e `TURNSTILE_SECRET` no Worker.                                                                 |
| `EBADENGINE` em `npm ci`              | Use Node 24.19.0 e npm 11.9.0 ou outra versão dentro dos intervalos de `package.json`.                                                             |
| Nome do projeto indisponível          | Escolha outro nome, execute `configure:cloudflare`, crie o Pages com esse nome e publique ambos.                                                   |
| Segundo jogador substitui o primeiro  | Use outro perfil de navegador; abas do mesmo perfil compartilham a identidade de convidado.                                                        |
| Sala não aparece na lista             | O anfitrião precisa divulgá-la publicamente antes do início; partidas iniciadas saem da lista de espera.                                           |
| Rede LAN não acessa                   | Confira o IP do anfitrião, a porta 8788, o firewall e a origem LAN permitida no Worker local.                                                      |
| Erros de cota de Durable Objects      | Confira os limites de requisições e armazenamento do plano na conta Cloudflare.                                                                    |

Para acompanhar logs do backend:

```sh
npx wrangler tail --config wrangler.backend.jsonc
```

## Referências oficiais

Consultadas em 1 de outubro de 2026:

- Bindings e limitação de Durable Objects no Pages: https://developers.cloudflare.com/pages/functions/bindings/
- Deploy com Wrangler e limites do drag and drop: https://developers.cloudflare.com/pages/get-started/direct-upload/
- Pages Functions em modo avançado: https://developers.cloudflare.com/pages/functions/advanced-mode/
- Configuração Wrangler para Pages: https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- Imagem de build e versão de Node: https://developers.cloudflare.com/pages/configuration/build-image/
- Limites de assets do Pages: https://developers.cloudflare.com/pages/platform/limits/
- Alarms de Durable Objects: https://developers.cloudflare.com/durable-objects/api/alarms/
- WebSockets em Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Planos e consumo de Durable Objects: https://developers.cloudflare.com/durable-objects/platform/pricing/
