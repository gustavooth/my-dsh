# Guia: configurar e publicar uma nova versão do app Desktop

Este guia descreve o fluxo completo para lançar uma nova versão do app Desktop usando o feed de
atualizações do GitHub (padrão deste fork: `gustavooth/my-dsh`).

## Como o app decide que existe atualização

1. No launch, e depois sempre que o prazo de ~10 min vence (inclusive quando a janela ganha foco ou
   o sistema é retomado), o app consulta o feed selado no próprio instalador.
2. Com o feed GitHub, o `electron-updater` lê a **última release publicada** do repositório e baixa
   o arquivo de metadados: `latest.yml` (Windows) ou `latest-mac.yml` (macOS).
3. A versão do metadado precisa ser **semver estritamente maior** que a versão instalada
   (`app.getVersion()`). Versões iguais, menores ou downgrades são ignoradas.
4. Nada é baixado automaticamente: o download e a instalação exigem duas confirmações do usuário.

Consequências práticas:

- A release precisa ser **publicada** (não rascunho) e **não pode estar marcada como prerelease** no
  GitHub; releases marcadas como prerelease são invisíveis para o updater.
- O seletor "Canal de atualização" não aparece nesses builds: a fonte é sempre a release "Latest".
- Builds unsigned e builds de desenvolvimento não checam atualização (não têm `app-update.yml`).

## Pré-requisitos

- Node.js **24.9+** e pnpm 11.28.5 (fixado em `packageManager`; rode `corepack enable` se
  necessário). Confira com `node --version` — se o `node` do PATH for mais antigo, coloque um Node 24
  na frente antes dos comandos abaixo.
- Credenciais de assinatura, por plataforma:
  - **macOS**: Developer ID Application (`CSC_LINK` + `CSC_KEY_PASSWORD`),
    `DSH_DESKTOP_MACOS_SIGNING_IDENTITY`, `DSH_DESKTOP_MACOS_TEAM_ID` e uma estratégia de
    notarização (`APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER` ou `APPLE_KEYCHAIN_PROFILE`).
  - **Windows**: certificado de code signing (`DSH_DESKTOP_WINDOWS_CER_FILE`), SignTool
    (`DSH_DESKTOP_WINDOWS_SIGNTOOL`), container e PIN. O empacotamento Windows precisa rodar em
    Windows x64.
- GitHub CLI (`gh`) autenticado, para publicar a release.
- Um `DSH_DESKTOP_APP_ID` próprio (ex.: `com.gustavooth.dsh`).
- Uma origem HTTPS qualquer para a política de atualização obrigatória
  (`DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN`, ou `..._PROD_ORIGIN` com
  `DSH_DESKTOP_AUTO_UPDATE_ENV=production`). Ela é obrigatória em builds assinados, mesmo que você
  não rode o serviço de política; se o serviço não existir, as checagens falham em silêncio e não
  bloqueiam o app.

## Passo 1 — Definir a versão

Os manifestos da família dsh (raiz, `packages/` e `apps/`, incluindo `apps/desktop/package.json`)
compartilham a mesma versão, e o empacotador rejeita divergências. Não edite `package.json` à mão:
use o comando oficial de bump, que atualiza raiz, pacotes, manifestos privados e o lockfile, e cria
um commit:

```sh
pnpm run release:dsh 0.3.0        # ou: major | minor | patch
git log --oneline -1              # release(dsh): 0.3.0
```

O script também imprime a tag npm esperada (ex.: `dsh-v0.3.0`), criada manualmente depois do merge.
Para o GitHub Release deste guia usamos a tag `v<versão>`; o updater não exige formato de tag, apenas
que a release seja a "Latest".

Regras do updater (semver):

- A versão nova precisa ser **maior** que a instalada: `0.3.0` > `0.2.2-rc.3`.
- Uma versão de teste criada sobre uma base estável recebe o sufixo `-test.<AAAAMMDD>.<n>` e
  é **inferior** à base (`0.3.0-test.20261115.1` < `0.3.0`), portanto não atualiza uma instalação
  estável. Para testar o fluxo de atualização de verdade, publique uma versão de produto maior
  (ex.: `0.3.1`) ou um build sobre uma base prerelease.
- Sem alterar os manifestos, você pode numerar um build pontual sobre a versão atual do produto. Com
  o produto em `0.2.2-rc.3`, o sufixo repete os campos da prerelease:

```sh
pnpm --dir apps/desktop run package:mac:arm64 -- --build-version 0.2.2-rc.3.20261115.1
```

Esse build (`0.2.2-rc.3.20261115.1`) é **superior** a `0.2.2-rc.3`, então serve para testar uma
atualização real sem subir a versão do produto. O prefixo depende da base: sobre `0.3.0` (estável) o
formato seria `0.3.0-test.20261115.1`. O modo `--build-version auto` também existe, mas depende de
`GITHUB_RUN_NUMBER`/`GITHUB_RUN_ATTEMPT` (uso em CI).

## Passo 2 — Configurar o ambiente

Copie o exemplo da plataforma e preencha os valores:

```sh
cp apps/desktop/.env.macos.example apps/desktop/.env.macos       # macOS
cp apps/desktop/.env.windows.example apps/desktop/.env.windows   # Windows
```

Campos relevantes para o feed (já vêm com os valores padrão):

```dotenv
DSH_DESKTOP_UPDATE_FEED=github
DSH_DESKTOP_UPDATE_GITHUB_REPOSITORY=gustavooth/my-dsh
```

- Para apontar para outro repositório, troque `DSH_DESKTOP_UPDATE_GITHUB_REPOSITORY`. O valor aceita
  `owner/repo`, `https://github.com/owner/repo` ou a URL com `.git`.
- Para voltar ao feed antigo (Tencent COS), use `DSH_DESKTOP_UPDATE_FEED=generic` e preencha
  `DOWNLOAD_TEST_ORIGIN`/`DOWNLOAD_TEST_RELEASE_ID` (ou as variáveis de produção).
- Essas escolhas são **seladas no instalador**: mudar o repositório exige gerar e distribuir um novo
  build; instalações antigas continuam olhando o endereço com que foram empacotadas.

## Passo 3 — Validar e empacotar

Sempre valide a configuração antes de assinar:

```sh
pnpm install

# macOS (rodar no macOS)
pnpm --dir apps/desktop run check:package -- mac-arm64
pnpm --dir apps/desktop run package:mac:arm64

# Windows (rodar no Windows x64)
pnpm --dir apps/desktop run check:package -- win-x64
pnpm --dir apps/desktop run package:win:x64
```

Use `mac-x64` no lugar de `mac-arm64` para Intel.

Os artefatos ficam em `apps/desktop/.desktop-build/targets/<alvo>/artifacts/`:

| Alvo | Arquivos que importam |
|---|---|
| `mac-arm64` / `mac-x64` | `.dmg`, `.zip`, `.zip.blockmap`, `latest-mac.yml` |
| `win-x64` | `.exe`, `.exe.blockmap`, `latest.yml` |

O arquivo `<alvo>-release.json` é o registro de conclusão do empacotamento; não é anexado à release.

O `.dmg` serve para instalação manual; o updater usa o `.zip` no macOS. `.zip` (ou `.exe` no
Windows) e `latest*.yml` são obrigatórios para atualização; o `.blockmap` é opcional e habilita
download diferencial.

Observações:

- O build precisa ser **assinado** para ter feed. `--unsigned` e builds de desenvolvimento não geram
  `app-update.yml` e por isso nunca checam atualização.
- O `latest*.yml` gerado já contém a versão do build e o SHA-512 do instalador; não edite o arquivo.

## Passo 4 — Publicar a release no GitHub

1. Confira que a tag e a versão batem (recomendado: `v` + versão do build). Execute a publicação
   **depois do merge**: sem `--target`, o `gh` cria a tag no HEAD do branch padrão.

```sh
VERSION=0.3.0
TAG="v$VERSION"
```

2. Crie a release com os artefatos. Publique **sem** `--draft` e **sem** `--prerelease`:

```sh
cd apps/desktop

# Windows
gh release create "$TAG" \
  --title "DeepSeek Harness $VERSION" \
  --notes "Versão $VERSION" \
  .desktop-build/targets/win-x64/artifacts/latest.yml \
  .desktop-build/targets/win-x64/artifacts/deepseek-harness-$VERSION-win-x64.exe \
  .desktop-build/targets/win-x64/artifacts/deepseek-harness-$VERSION-win-x64.exe.blockmap

# macOS: anexe à mesma release (a tag já deve existir)
gh release upload "$TAG" \
  .desktop-build/targets/mac-arm64/artifacts/latest-mac.yml \
  .desktop-build/targets/mac-arm64/artifacts/deepseek-harness-$VERSION-mac-arm64.dmg \
  .desktop-build/targets/mac-arm64/artifacts/deepseek-harness-$VERSION-mac-arm64.zip \
  .desktop-build/targets/mac-arm64/artifacts/deepseek-harness-$VERSION-mac-arm64.zip.blockmap
```

Regras:

- Uma única release por versão, contendo os dois sistemas quando ambos forem suportados: o updater
  procura `latest.yml`/`latest-mac.yml` nos anexos da release "Latest".
- O GitHub marca automaticamente uma release não-rascunho e não-prerelease como "Latest". Se você
  criar uma release mais nova com versão menor, o app a vê mas ignora (sem downgrade).
- Nomes dos anexos precisam ser idênticos aos referenciados no `latest*.yml`.
- Marcar a release como prerelease no GitHub a torna invisível para o updater, mesmo que a tag seja
  uma versão normal.
- Rascunhos também são invisíveis. Só publique quando os artefatos estiverem anexados.
- Os comandos deste repositório para publicar no COS (`upload:*`, `publish-desktop-ci`) não são usados
  no feed GitHub, e o empacotador sempre roda o `electron-builder` com `--publish never`. Publique os
  artefatos com `gh`.

## Passo 5 — Verificar a atualização de ponta a ponta

1. Instale a versão anterior (assinada) na máquina de teste.
2. Confira a release publicada:

```sh
VERSION=0.3.0; TAG="v$VERSION"   # mesmos valores do Passo 4
gh release view "$TAG" --json tagName,isDraft,isPrerelease,assets
gh api repos/gustavooth/my-dsh/releases/latest --jq '.tag_name'
```

3. Abra o app e use o item de menu de verificação de atualizações (o texto segue o idioma do app,
   por exemplo **Aplicativo → Verificar atualizações…**). A checagem automática também acontece no
   próximo launch; o item de menu força uma checagem imediata.
4. O esperado: diálogo informando a versão disponível → confirmação de download → confirmação de
   instalar e reiniciar → app reabre na versão nova (confira em **Sobre**).
5. Se a janela não estiver visível quando o download terminar, a confirmação de instalação aparece
   na próxima vez que a janela for mostrada.

## Referência rápida

| Item | Valores |
|---|---|
| `DSH_DESKTOP_UPDATE_FEED` | `github` (padrão) · `generic` (COS) |
| `DSH_DESKTOP_UPDATE_GITHUB_REPOSITORY` | `gustavooth/my-dsh` (padrão) |
| Metadados do feed GitHub | `latest.yml` (Windows) · `latest-mac.yml` (macOS) |
| Versão comparada | `latest*.yml` → `version` vs `app.getVersion()` |
| Canal nightly/stable | Só para feed `generic`; oculto no feed GitHub |
| Artefatos | `apps/desktop/.desktop-build/targets/<alvo>/artifacts/` |
| Instalador sem feed | Gerado com `--unsigned` ou em desenvolvimento |

## Solução de problemas

| Sintoma | Causa provável | Correção |
|---|---|---|
| `No published versions on GitHub` | Não existe release publicada não-prerelease | Publique a release sem draft/prerelease |
| `Cannot find latest.yml ...` | Metadado ausente ou com nome de canal (`nightly.yml`) | Anexe `latest.yml`/`latest-mac.yml` com esse nome exato |
| `desktop update: this application has no packaged update source` | Build unsigned/dev, sem `resources/app-update.yml` | Gere um build assinado com feed |
| App diz que já está atualizado | `version` do metadado não é maior que a instalada | Aumente a versão do produto; não reutilize uma versão já instalada |
| Seletor de canal não aparece | Feed GitHub usa apenas a release Latest | Comportamento esperado |
| Falha de assinatura ao instalar (Windows) | Certificado/publisher diferentes do `publisherName` selado | Assine todos os builds com o mesmo certificado |
| Falha de instalação no macOS | App não assinado/notarizado | Use Developer ID + notarização |
| Build assinado falha pedindo origem de política | `DSH_DESKTOP_MANDATORY_UPDATE_*` ausente | Defina uma origem HTTPS válida |
| Erro 403/limite de requisições | Muitas checagens no mesmo IP ou proxy bloqueando o GitHub | Verifique proxy/rede; a checagem padrão é de 10 min |

## Checklist

- [ ] `pnpm run release:dsh <versão>` aplicado e commitado (todos os manifestos iguais).
- [ ] `.env.macos`/`.env.windows` preenchido (assinatura, app id, política, feed).
- [ ] `check:package` passou.
- [ ] Build assinado gerou instalador + `latest*.yml`.
- [ ] Release criada no GitHub **sem** draft e **sem** prerelease.
- [ ] `latest.yml`/`latest-mac.yml` e instaladores anexados à release.
- [ ] Instalação anterior verificou, baixou e reiniciou na versão nova.
