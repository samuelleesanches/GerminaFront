# Sistemas e escopo desta versão

Esta versão amplia o projeto OpenFront fornecido. O mapa, a conquista por tiles, a execução determinística, os bots de combate e o transporte binário continuam sendo a base do jogo. A nova camada estratégica roda na mesma simulação e envia suas decisões pelo mesmo protocolo das ações de combate.

## Ativar e usar

Ao criar uma sala ou partida Solo, o componente **Strategic mode** permite ativar a camada estratégica, escolher o perfil Casual/Normal/Chaotic, disponibilidade de recursos, eventos e condição de vitória. Os novos textos estão no catálogo inglês, seguindo a organização do projeto original; traduções adicionais usam o fallback inglês.

Durante a partida, o botão **Country** abre um painel com 11 abas: economia, população, recursos, comércio, forças armadas, tecnologia, infraestrutura, diplomacia, clima, ações e notícias. O painel mostra o estado recebido da simulação. As decisões passam pelo EventBus, pelo Transport e pela fila de turnos; elas não alteram apenas números no DOM.

## Sistemas conectados

| Sistema           | Comportamento implementado                                                                                  | Relação com a partida                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Economia          | Oito políticas econômicas e distribuição de trabalhadores entre produção, exército e ciência                | Alteram produção, renda em ouro, recrutamento e velocidade de pesquisa                                       |
| População         | Crescimento, consumo de comida, estabilidade e mobilização                                                  | Falta de comida e mobilização afetam estabilidade e eficiência                                               |
| Recursos          | 29 recursos e produtos com estoques, produção, consumo, depósitos e preços                                  | Entradas industriais são consumidas; ouro e estoques limitam compras e investimentos                         |
| Indústria         | 13 receitas de produtos, incluindo aço, combustível, veículos, eletrônicos, drones, navios e aeronaves      | A cadeia usa recursos anteriores; pesquisa desbloqueia produtos avançados                                    |
| Energia           | Fontes térmicas, nuclear, solar, eólica e hidrelétrica                                                      | Fontes térmicas/nuclear consomem insumos; clima influencia renováveis; energia entra em receitas industriais |
| Comércio          | Compra/venda entre países com estoque real e transferência de ouro, ofertas e aceitação de contratos        | Embargos, guerras, sanções, portos, ferrovias e clima afetam negociações ou entregas                         |
| Pesquisa          | Oito áreas, com quatro níveis, custo e progresso                                                            | Desbloqueia formações/produtos e melhora eficiência econômica ou militar                                     |
| Infraestrutura    | 22 investimentos nacionais, com custo em ouro, aço e madeira e limite de níveis                             | Produção, pesquisa, população, logística, defesa e armazenamento recebem efeitos concretos                   |
| Forças armadas    | 24 tipos de formações, incluindo blindados, aviação, drones, submarinos e porta-aviões                      | Consomem ouro, produtos e população; melhoram a eficiência do exército e da navegação existentes             |
| Combate           | Modificadores estratégicos de eficiência terrestre, apoio aéreo, defesa e combustível                       | Entram no custo de avanço e perdas do ataque original; clima/combustível também afetam embarcações           |
| Diplomacia        | Reputação, influência, neutralidade, guerra, paz negociada entre aliados e ajuda em comida                  | Neutralidade impede suas ofensivas contra países; guerras bloqueiam comércio; ajuda transfere comida         |
| Assembleia        | Propostas de sanções, votos e decisão por maioria dos países elegíveis                                      | Sanções temporárias restringem comércio; propostas consomem influência                                       |
| Clima             | 11 condições temporárias, derivadas de sorteio determinístico e terreno nacional                            | Produção agrícola, energia renovável, combate e marinha sofrem alterações limitadas                          |
| Geografia         | Terreno da capital, depósitos compatíveis com o terreno e levantamento de tiles possuídos                   | Conquista e posição influenciam o potencial produtivo; o relevo tático original permanece no combate         |
| Bolsa             | Oito empresas setoriais, preços, histórico curto, compra/venda de ações e dividendos                        | Produção, exportações, crises e conflitos influenciam os preços; investimentos usam o ouro da partida        |
| Eventos           | Descobertas, avanço científico, crise sanitária/civil, expansão econômica e desastres                       | Modificam depósitos, pesquisa, população, estabilidade, infraestrutura, influência ou ações                  |
| IA                | Políticas, pesquisa, compras essenciais, exportações, indústria e recrutamento estratégico                  | Complementa a IA de combate do jogo original                                                                 |
| Vitória           | Vitória original por território e condições temporizadas por equilíbrio econômico, diplomacia ou tecnologia | A condição estratégica usa o estado acumulado; partidas em equipes mantêm a vitória original                 |
| Qualidade gráfica | LOW/MEDIUM/HIGH no painel                                                                                   | Atualiza as configurações reais do renderer: efeitos, fallout, brilho, nomes e skins territoriais            |

Os números da estratégia são atualizados em ciclos de 20 ticks. Mercado, contratos, bolsa, assembleia e eventos têm cadências próprias. A aleatoriedade usa a seed da partida; snapshots guardam também seu estado. O hash de sincronização incorpora a estratégia.

## Abstrações usadas e limites funcionais

As formações estratégicas representam capacidade militar nacional. Elas **não são 24 novos modelos de unidades móveis desenhados no mapa**. Porta-aviões, submarinos, aeronaves e drones entram em custos, pré-requisitos e modificadores; os navios e ataques originais continuam executando as ações táticas.

Os investimentos estratégicos representam infraestrutura nacional. Eles não criam automaticamente estradas, trilhos, aeroportos ou usinas como objetos posicionáveis no mapa. As estruturas originais de construção continuam disponíveis pelo sistema original.

O clima é nacional e temporário. Não há nuvens ou frentes meteorológicas contínuas percorrendo os tiles. Recursos e terrenos estratégicos combinam o mapa existente com geração determinística; não constituem uma base factual de reservas ou biomas de países reais.

Os modos de mapa do painel são um **minimapa de centros dos países**, com cores e linhas de contratos. Eles não substituem a pintura territorial do mapa principal por nove overlays completos. As rotas comerciais usam uma aproximação de distância e capacidade portuária/ferroviária; não simulam caminhos navais tile a tile, estreitos específicos, bloqueios de estreitos ou escolta de cada cargueiro.

A tarifa implementada aumenta o custo de contratos como fricção comercial. Não há uma contabilidade fiscal completa de receita tarifária, orçamento público, dívida ou bancos centrais. Os estoques e o ouro usados nas ações são reais dentro da simulação, mas o modelo econômico é simplificado para partidas rápidas.

O backend Cloudflare coordena e persiste os turnos; a simulação permanece nos clientes. Os testes de determinismo e a comparação de hashes ajudam a detectar divergências, mas essa adaptação não adiciona uma simulação autoritativa completa nem um sistema de anticheat comercial.

O briefing anexado descreve um produto mais amplo do que esta entrega. Os itens abaixo **ainda não foram implementados em profundidade**:

- cultura, religiões, ideologias, organizações civis e sistemas históricos detalhados;
- espionagem, guerra cibernética, propaganda e operações clandestinas próprias;
- mercado negro, moedas nacionais, crédito, inflação macroeconômica e bolsa por empresa individual;
- tratados multilaterais complexos, blocos políticos e organizações internacionais completas;
- armamentos nucleares e antiaéreos estratégicos como novos objetos táticos além das unidades originais;
- overlays territoriais completos, efeitos meteorológicos visuais e rotas de comércio com pathfinding naval;
- login próprio, ranking persistente, loja e substituição da API comercial oficial.

Essas distinções evitam confundir uma camada estratégica funcional com a implementação completa de todos os detalhes do briefing. O código das regras fica em `src/core/strategy/`; o painel fica em `src/client/StrategyPanel.ts` e as configurações em `src/client/StrategySettings.ts`.

## Multiplayer Cloudflare

O backend usa uma identidade de convidado por navegador. Ele verifica autoria dos controles de sala, limita frames e conexões, carimba o `clientID` nas intenções e usa o protocolo binário existente. Tokens privados não aparecem nas informações públicas da sala. Kicks de salas privadas são persistidos por identidade.

O Worker persiste configuração, participantes, intenções pendentes e histórico de turnos. O contexto binário é reconstruído a partir do roster congelado do início da partida. Uma reconexão recebe a identidade anterior e os turnos que faltam.

O Pages serve mapas e assets com URLs locais e nomes com hash, encaminha API e WebSockets pelo binding `BACKEND` e atende links de convite sem depender de templates EJS no servidor.

Veja `INSTALACAO_CLOUDFLARE.md` para os comandos de instalação e `VALIDACAO.md` para o que foi efetivamente verificado.
