# DeepSeek Harness Desktop — empacotamento `.deb` (Linux x64)

Documento operacional: dependências necessárias e o processo completo de build/compactação do pacote Debian (`.deb`) para `linux-x64` (amd64).

> Alvo oficial do repo: `linux-x64` → `.deb`.
> Alvo secundário: `dir` (diretório não empacotado) e `--check` (validação de configuração/toolchain).

---

## 1. Visão geral

O `.deb` é produzido por `apps/desktop/scripts/package-target.ts` (`linux-x64`), que orquestra:

1. `build` (compilação de todo o monorepo + gates de tipo).
2. `pack` (empacotamento tarball das dependências de workspace).
3. `prepare:runtime` (Electron + runtime primário: Python, pnpm, CLI).
4. `prepare:packages` (seleção do conjunto de pacotes por plataforma).
5. `prepare:dsh` (instalação de produção do runtime `dsh` + smoke do payload).
6. `electron-builder --linux --x64` (monta `app.asar`, recursos e o `.deb` via `fpm`).
7. `smoke-packaged-runtime` (verificação pós-build do app empacotado).

O artefato final fica em:

```
apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/
  deepseek-harness-<versão>-linux-amd64-unsigned.deb
```

---

## 2. Dependências

### 2.1 Sistema (build host: Debian/Ubuntu/Pop!_OS)

| Pacote | Para quê | Obrigatório |
|---|---|---|
| `build-essential` | `cc` (gcc), `g++`, `make`, `libc6-dev`, `binutils` (`ar`) | Sim |
| `python3` | scripts de build e `node-gyp` | Sim |
| `pkg-config` | detecção de libs nativas | Sim |
| `libssl-dev` | headers de OpenSSL para módulos nativos | Sim |
| `xz-utils` | `tar -J` / compressão `data.tar.xz` do `.deb` | Sim |
| `libcrypt1` | fornece `libcrypt.so.1`, exigido pelo `fpm` (Ruby) | Sim¹ |
| `clang` + `lld` | alternativa ao `cc`/gcc (opcional) | Não |
| `musl-tools` | fornece `musl-gcc` para o `landlock-run` estático | Não² |
| `dpkg` / `dpkg-deb` | inspecionar/instalar o `.deb` | Não³ |
| `fakeroot` | não exigido pelo `electron-builder`/`fpm` moderno | Não |

¹ Normalmente já instalado em Pop!_OS/Ubuntu. Se o `fpm` falhar com `libcrypt.so.1: cannot open shared object file`, instale `libcrypt1`.
² Só é necessário se o build compilar o binário estático `landlock-run`; o gate normal usa `--host-addon-only` (apenas o addon Node-API `flock`).
³ O `electron-builder` não depende de `dpkg-deb`; ele usa o `fpm` baixado em cache. `dpkg-deb` serve para inspecionar o resultado.

Instalação recomendada:

```sh
sudo apt update
sudo apt install -y build-essential clang lld python3 pkg-config libssl-dev xz-utils libcrypt1
# opcional (landlock estático):
sudo apt install -y musl-tools
```

Verificação:

```sh
cc --version && make --version && python3 --version && xz --version
ar --version        # binutils
ldconfig -p | grep libcrypt.so.1
```

### 2.2 Node.js e pnpm

| Ferramenta | Versão | Observação |
|---|---|---|
| Node.js | `>= 24.9.0` | Usado/testado: **v24.21.0** (mesma do `scripts/primary-runtime/lock.json`) |
| pnpm | **11.28.5** | Fixado em `package.json` → `packageManager` |

> Node 18 **não funciona**: o repo usa `node:util` `parseEnv` (Node 20.12+) e import attributes (`import … with { type: 'json' }`, Node 20+).

```sh
export PATH="$HOME/.local/node24/bin:$HOME/.local/share/pnpm/bin:$PATH"
node -v   # v24.x
pnpm -v   # 11.28.5
```

### 2.3 Runtime empacotado dentro do app

Carregado pelo `prepare:runtime` / `prepare:dsh` (fontes fixadas no repo):

| Componente | Versão / origem | Papel |
|---|---|---|
| Electron | **44.7.0** | Shell nativo; binário Linux baixado para `.desktop-build/targets/linux-x64/electron` |
| Node embutido | **24.21.0** | Executado via `ELECTRON_RUN_AS_NODE=1` |
| Python | **3.12.14** | Distribuição portátil em `resources/runtime/primary-runtime` |
| Bibliotecas Python | numpy 2.3.5, pandas 3.0.1, Pillow 12.3.0, lxml 6.1.3, python-docx, python-pptx, openpyxl, XlsxWriter + dependências | Skills Office; URLs/hashes em `scripts/primary-runtime/lock.json` (`targets.linux-x64`) |
| pnpm embutido | **11.28.5** | Operações de pacote do app (`resources/runtime/primary-runtime/dependencies/pnpm`) |
| Addon nativo `flock` | Node-API 8, glibc | Compilado no build com `cc` + headers do Node |
| `landlock-run` | estático musl | Opcional; não compilado no gate `--host-addon-only` |
| Engine Office | **WASM** (`@deepseek-ai/libreoffice-kit-wasm`) | Linux não possui engine nativo publicado |
| `sharp` | 0.35.5 + `@img/sharp-linux-x64` (libvips) | Processamento de imagens (decodificação tem bug upstream no Electron/Linux — ver §7) |
| `node-pty`, `koffi`, `ripgrep`, `turndown`, `domino` | pacotes do runtime | Terminal, FFI, busca, HTML |

### 2.4 Variáveis de ambiente relevantes

| Variável | Uso |
|---|---|
| `DSH_DESKTOP_TARGET_PLATFORM=linux` | Seleciona o alvo |
| `DSH_DESKTOP_TARGET_ARCH=x64` | Arquitetura |
| `DSH_DESKTOP_UNSIGNED=1` | Build local sem assinatura/notarização |
| `DSH_DESKTOP_APP_ID` | ID reverso-DNS do app (local unsigned usa `com.deepseek.harness`) |
| `DSH_DESKTOP_MACOS_SKIP_NOTARIZATION=0` | Não se aplica ao Linux, mas compõe o ambiente do target |
| `DSH_DESKTOP_LINUX_PACK_CONCURRENCY` | Workers de empacotamento (padrão 4) |
| `DSH_DESKTOP_PACKAGE_CACHE_DIR` | Cache compartilhado de downloads/pnpm |
| `TMPDIR` | Diretório de staging do `fpm` (importante se `/tmp` for tmpfs pequeno) |
| `DSH_DESKTOP_UPDATE_CHANNEL` | `nightly`/`stable` (não usado no feed Linux; `.deb` atualiza via apt) |

### 2.5 Disco e memória

- **Disco:** ~4–6 GB livres (Electron + runtime Python + staging + `.deb`).
- **`/tmp`:** o `fpm` copia ~1,1 GB para staging e gera ~265 MB de `data.tar.xz`. Se `/tmp` for tmpfs pequeno, aponte `TMPDIR` para o disco grande:

```sh
export TMPDIR=/var/tmp      # ou outro diretório no disco
```

- **Memória:** o typecheck agregado do Host (`tsc -p tsconfig.host.json`) precisa de ~8 GB de heap; o gate já invoca com `--max-old-space-size=8192`.

---

## 3. Pipeline de empacotamento (passo a passo)

### Etapa 0 — Preflight

O comando:

```sh
pnpm --dir apps/desktop run package:linux:x64:unsigned
```

Resolve o alvo e valida o host:

- `resolveDesktopPackageTarget('linux-x64')` exige host **Linux x64**.
- `localLinuxPackageEnvironment()` define `DSH_DESKTOP_APP_ID=com.deepseek.harness` e `DSH_DESKTOP_UNSIGNED=1`, sem ler `.env`.
- `validateDesktopPackageEnvironment` valida app id, registry npm, tuning de empacotamento e toolchain; **não** exige política de update obrigatório no Linux.

### Etapa 1 — Build do monorepo

```sh
pnpm run build --profile local
```

Executa os gates (`run-gates`):

1. **native addon** — `tsx native/system/scripts/build.ts --host-addon-only` (compila `flock` com `cc`; precisa dos headers do Node em `<node>/include/node`).
2. **Host Typert** — geração de metadados.
3. **host compiler** — `tsc -b` das referências Host.
4. **Host bundle** — `tsdown` (face host).
5. **Desktop bundle** — `pnpm --filter @deepseek-ai/dsh-desktop run bundle`.
6. **client compiler** — `tsc -b` das referências Client.
7. **Client bundle** — `tsdown` (face client).
8. **Web build** — `pnpm run build:web`.
9. **host aggregate check** — `tsc -p tsconfig.host.json` (heap 8 GB).
10. **client aggregate check** — `tsc -p tsconfig.client.json`.

### Etapa 2 — Pack das dependências

Empacota os tarballs de workspace e o `native/system`:

```sh
# unsigned:
pnpm exec tsx apps/desktop/scripts/pack-local-packages.ts --out <packedDsh>
# desktop-host e vendor:
pnpm --dir apps/desktop-host pack --pack-destination <packedDsh>
pnpm run release:pack --family vendor --out <packedVendor>
pnpm --dir native/system run build:ts
pnpm --dir native/system/packages/entry pack --pack-destination <packedLandlock>
```

### Etapa 3 — `prepare:runtime`

```sh
pnpm run prepare:runtime
```

- Baixa/extrai **Electron 44.7.0** para `.desktop-build/targets/linux-x64/electron` (executável `electron`).
- Prepara o runtime primário Linux (`scripts/primary-runtime/lock.json` → `linux-x64`): Python 3.12.14 + wheels manylinux + pnpm.
- Copia os launchers de CLI (`runtime/cli/bin/dsh`, POSIX `chmod 755`).
- Em Linux, o `landlock-run` estático é compilado apenas quando o gate roda sem `--host-addon-only`.

### Etapa 4 — `prepare:packages`

```sh
pnpm run prepare:packages
```

Filtra o “package set” de produção pela plataforma/arquitetura alvo (`linux`, `x64`), incluindo dependências nativas compatíveis e excluindo as de outras plataformas.

### Etapa 5 — `prepare:dsh`

```sh
pnpm run prepare:dsh
```

- Executa uma instalação **produção** do runtime `dsh` com o pnpm embutido, sob `ELECTRON_RUN_AS_NODE=1`.
- Materializa `node_modules` com a política de arquivos (`desktopRuntimeFileExclusion`) e grava `desktop-runtime.json` (versões, plataforma, arquitetura, inventário).
- Roda o **payload smoke** (`apps/desktop/tests/fixtures/runtime-payload-smoke.mjs`): pnpm, koffi, `sharp` (encode; decode é pulado no Electron/Linux — ver §7), HTML/Domino, PTY, ripgrep.
- Em builds `--unsigned`, o smoke é o único gate de runtime antes do electron-builder.

### Etapa 6 — `electron-builder` (montagem e compactação do `.deb`)

```sh
pnpm exec electron-builder \
  --config electron-builder.config.mjs \
  --linux --x64 --publish never
```

O que acontece:

1. Copia a distribuição Electron preparada para `linux-unpacked/`.
2. Empacota o app em `resources/app.asar` (main, preloads, renderer, `dsh/`, `node_modules`).
3. `asarUnpack` deixa fora do ASAR os binários que não podem ser lidos de dentro dele: `**/*.{node,dylib,dll,so,exe}`, `**/*.so.*`, `spawn-helper`, ripgrep, engine Office (WASM) e helper Computer Use.
4. Copia `resources/runtime` (Python, pnpm, Node) como `extraResources`.
5. Gera o `.deb` com **`fpm`**:
   - `-t deb`, `--architecture amd64`, `--deb-compression xz`
   - `--version 0.2.2~rc.3` (o `-rc.3` vira `~rc.3` para ordenação Debian)
   - `--name DeepSeek Harness`, `--maintainer`, `--url`, `--license MIT`
   - dependências: `libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0`
   - recomendação: `libappindicator3-1`

### Etapa 7 — Smoke pós-build

```sh
pnpm exec tsx scripts/smoke-packaged-runtime.ts --unsigned
```

Verifica o app **já empacotado**: integridade do runtime, payload smoke dentro do ASAR, boot do Host, e conversão Office (DOCX/XLSX/PPTX → PDF/PNG). Em `--unsigned` não se grava registro de release.

> **Importante:** como o `.deb` é gerado na Etapa 6, ele **já existe** mesmo que a Etapa 7 falhe.

---

## 4. Anatomia do `.deb` (como é compactado)

O `.deb` é um arquivo `ar` padrão com três membros:

```
debian-binary        # "2.0\n"
control.tar.xz      # metadados: control, md5sums, postinst, postrm
data.tar.xz         # payload comprimido (xz)
```

### 4.1 `control.tar.xz`

- `control`:
  ```
  Package: deepseek-harness
  Version: 0.2.2~rc.3
  Architecture: amd64
  Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6,
           xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0
  Recommends: libappindicator3-1
  Maintainer: DeepSeek <deepseek-harness@deepseek.com>
  Homepage: https://github.com/gustavooth/my-dsh
  Description: DeepSeek Harness
    Electron desktop shell for a bundled dsh runtime and external plugins
  ```
- `md5sums`: checksums de cada arquivo instalado.
- `postinst`: registra `/usr/bin/deepseek-harness` (via `update-alternatives`), ajusta `chrome-sandbox` (4755 só se não houver user namespaces) e instala perfil AppArmor em Ubuntu 24+.
- `postrm`: limpeza inversa.

### 4.2 `data.tar.xz` (layout instalado)

```
/opt/DeepSeek Harness/            # aplicativo Electron completo
  deepseek-harness                # executável principal
  chrome-sandbox
  resources/app.asar              # app + dsh + node_modules
  resources/app.asar.unpacked/    # nativos (.node/.so), engine Office WASM
  resources/runtime/              # Python, pnpm, Node portáteis
  resources/apparmor-profile
/usr/share/applications/deepseek-harness.desktop
/usr/share/icons/hicolor/scalable/apps/deepseek-harness.svg
```

O ícone escalável é a baleia oficial do DeepSeek Harness (`apps/desktop/resources/icon-linux.svg`, derivada de `https://www.deepseek.com/harness/favicon.svg`), instalada em `hicolor/scalable/apps` para que os ambientes desktop a resolvam em qualquer tamanho.

`.desktop`:

```ini
[Desktop Entry]
Name=DeepSeek Harness
Exec="/opt/DeepSeek Harness/deepseek-harness" %U
Type=Application
Icon=deepseek-harness
StartupWMClass=DeepSeek Harness
Categories=Development;
MimeType=x-scheme-handler/dsh;
```

### 4.3 Tamanhos de referência

| Item | Tamanho |
|---|---|
| `linux-unpacked/` | ~1,1 GB |
| `data.tar.xz` | ~265 MB |
| `.deb` final | ~282 MB |

---

## 5. Comandos na máquina (Pop!_OS / Ubuntu)

```sh
# 1) Kit C + ferramentas
sudo apt update
sudo apt install -y build-essential clang lld python3 pkg-config libssl-dev xz-utils libcrypt1

# 2) Node 24 (ex.: nvm, ou o binário em ~/.local/node24)
export PATH="$HOME/.local/node24/bin:$HOME/.local/share/pnpm/bin:$PATH"
node -v   # v24.x
pnpm -v   # 11.28.5

# 3) Dependências do repo
cd ~/Documents/deepseek-harness
pnpm install --frozen-lockfile

# 4) Empacotar
TMPDIR=/var/tmp pnpm --dir apps/desktop run package:linux:x64:unsigned
```

Saída:

```
apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/
  deepseek-harness-0.2.2-rc.3-linux-amd64-unsigned.deb
```

Instalar:

```sh
sudo apt install ./deepseek-harness-0.2.2-rc.3-linux-amd64-unsigned.deb
```

Variantes úteis:

```sh
# só validar configuração/toolchain (sem build)
pnpm --dir apps/desktop run package:linux:x64 --check

# gerar só o diretório não empacotado
pnpm --dir apps/desktop run package:linux:x64:dir
```

> O pacote é **não assinado** (`--unsigned`). `apt` pode emitir aviso de assinatura; o `apt install ./arquivo.deb` local funciona.

### 5.1 Reempacotar com uma versão nova (instalar por cima da anterior)

`dpkg`/`apt` só substitui o pacote instalado quando a versão do `.deb` é **maior**. Reinstalar a
mesma versão exige `dpkg -i --force-*` ou remover antes. Para gerar um `.deb` que atualiza por cima,
o empacotador aceita `--build-version`, que muda só a versão do artefato — os manifestos do repo
continuam em `0.2.2-rc.3`:

```sh
export PATH="$HOME/.local/node24/bin:$PATH"
TMPDIR=/var/tmp pnpm --dir apps/desktop run package:linux:x64:unsigned -- \
  --build-version 0.2.2-rc.3.20261115.1
```

Regras da versão de build (validadas por `apps/desktop/scripts/desktop-build-version.mjs`):

- precisa estender a versão do produto repetindo os campos de prerelease: `0.2.2-rc.3` →
  `0.2.2-rc.3.<data>.<sequência>` (base estável usaria `<versão>-test.<data>.<sequência>`);
- `<data>` é `YYYYMMDD` e `<sequência>` começa em 1 por dia (`--build-version auto` deriva a
  sequência, mas a descoberta local lê só artefatos mac/win — no Linux use a versão explícita);
- sem metadados de build (`+sha`), que o `electron-updater` não distingue.

O `electron-builder` converte o prerelease para a ordenação Debian (`-rc.3.20261115.1` →
`~rc.3.20261115.1`), então a versão instalada passa a ser `0.2.2~rc.3.20261115.1`:

```sh
ls apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/*.deb
dpkg-deb -f apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/\
deepseek-harness-0.2.2-rc.3.20261115.1-linux-amd64-unsigned.deb Version
# 0.2.2~rc.3.20261115.1
dpkg --compare-versions 0.2.2~rc.3.20261115.1 gt 0.2.2~rc.3 && echo "atualiza por cima"

sudo apt install ./apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/\
deepseek-harness-0.2.2-rc.3.20261115.1-linux-amd64-unsigned.deb
```

Para mudar a versão **do produto** (aparece em `dsh --version`, npm e updater), o caminho é outro:
`pnpm run release:dsh 0.2.3` (ou `major|minor|patch`), que atualiza raiz, `packages/`, `apps/` e o
lockfile e cria um commit. O empacotador rejeita manifestos divergentes.

O smoke pós-build (§3, Etapa 7) pode falhar na conversão Office por causa da limitação do §7.1; o
`.deb` já foi gravado na Etapa 6 e continua instalável.

---

## 6. Problemas encontrados e correções

| Sintoma | Causa | Correção |
|---|---|---|
| `util.parseEnv` não exportado / `Unexpected token 'with'` | Node 18 | Usar Node ≥ 24.9 (v24.21.0) |
| `SyntaxError` ao carregar `pnpm` como módulo | pnpm standalone expõe binário ELF em `npm_execpath`; `runPnpm` rodava com `node` | `runPnpm` executa o binário direto quando não é entrypoint JS |
| `tsc` erros em `desktop-upload-plan.ts` / `desktop-release-store.ts` | uniões de target fechadas em mac/win | Ampliadas para `linux-x64` |
| `Please specify project homepage` | `fpm` exige `homepage` | `extraMetadata.homepage` no config |
| `DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN requires an HTTPS origin` | política de update obrigatório | Ignorada no Linux |
| `ruby: libcrypt.so.1: cannot open shared object file` | `fpm` precisa de `libcrypt.so.1` | Instalar `libcrypt1` (ou `LD_LIBRARY_PATH` com a lib extraída) |
| `tar failed (exit 2)` no `fpm` | `/tmp` tmpfs pequeno (staging 1,1 GB + 265 MB) | `TMPDIR` no disco grande |
| `Need executable 'ar'` | `binutils` ausente no sandbox | Instalar `binutils`/`build-essential` (no sandbox: `zig ar`) |
| `sharp` SIGSEGV no decode sob Electron | Conflito upstream Electron × GLib × libvips (electron#46323) | Smoke pula só o decode em Electron/Linux; encode continua validado |
| `Office engine ... linux-x64-glibc` não encontrado | Engine nativo Linux não publicado (npm 404); kit externo não faz fallback para WASM no ASAR | Limitação conhecida (§7) |

---

## 7. Limitações conhecidas (Linux/`.deb`)

1. **Conversão Office no app empacotado:** o runtime procura `@deepseek-ai/libreoffice-kit-linux-x64-glibc`, que **não existe no npm**, e o `@deepseek-ai/libreoffice-kit@0.2.3` não cai para o engine **WASM** dentro do ASAR. Na árvore preparada (não-ASAR) a conversão passa com WASM. Requer correção no kit externo ou no empacotamento.
2. **`sharp` decode sob Electron/Linux:** segfault por conflito de símbolos GLib (electron#46323). O encode funciona; o decode é afetado.
3. **Atualização in-app:** `.deb` não tem feed do `electron-updater`; atualizações via `dpkg`/`apt`.
4. **Política de update obrigatório:** não suportada no Linux (builds Linux pulam a validação).
5. **Pipeline de publicação/CI:** upload/rollout/website continuam mac/win; o workflow `linux-package.yml` e a rota em `DESKTOP_PUBLISH_RUNNERS` ainda não existem.

---

## 8. Verificação do pacote

Sem `dpkg` (ex.: sandbox), dá para inspecionar com `ar`/`bsdtar`:

```sh
ar t deepseek-harness-0.2.2-rc.3-linux-amd64-unsigned.deb
# debian-binary
# control.tar.xz
# data.tar.xz

mkdir -p /tmp/debcheck && bsdtar -xf deepseek-harness-0.2.2-rc.3-linux-amd64-unsigned.deb -C /tmp/debcheck
(cd /tmp/debcheck && bsdtar -xf control.tar.xz && cat control)
bsdtar -tf /tmp/debcheck/data.tar.xz | grep -E '^\./opt/|\.desktop$'
```

Com `dpkg`:

```sh
dpkg-deb -I deepseek-harness-0.2.2-rc.3-linux-amd64-unsigned.deb
dpkg-deb -c deepseek-harness-0.2.2-rc.3-linux-amd64-unsigned.deb | head
sudo apt install ./deepseek-harness-0.2.2-rc.3-linux-amd64-unsigned.deb
```

---

## 9. Arquivos do repo alterados para habilitar o Linux/`.deb`

- **Alvo e empacotamento:** `apps/desktop/scripts/desktop-build-paths.mjs` (+`.d.mts`), `package-target.ts`, `desktop-toolchain-preflight.ts`, `desktop-package-environment.mjs` (+`.d.mts`), `linux-package-settings.mjs` (+`.d.mts`), `prepare-runtime.ts`, `prepare-cli.ts`, `prepare-dsh.ts`, `smoke-packaged-runtime.ts`, `electron-builder-config.mjs`
- **Publisher/tipos:** `apps/desktop-publisher/src/desktop-auto-update-environment.mjs` (+`.d.mts`), `desktop-publish-targets.ts`, `desktop-release-store.ts`
- **Scripts:** `apps/desktop/scripts/desktop-upload-plan.ts`, `runPnpm` (execução do binário pnpm), `package.json` (raiz e `apps/desktop`), `.env.linux.example`
- **Smoke/specs:** `apps/desktop/tests/fixtures/runtime-payload-smoke.mjs` (skip do decode `sharp` em Electron/Linux), specs de conjunto de targets

---

## 10. Reprodução em sandbox Flatpak (referência)

No sandbox usado para validar este processo não havia `cc`, `ar` nem `libcrypt.so.1`. Os ajustes abaixo são **específicos de sandbox**; em Pop!_OS com `build-essential` eles não são necessários:

```sh
# compilador portátil (Zig) como cc
~/.local/zig/zig cc --version
printf '#!/bin/sh\nexec %s/.local/zig/zig cc "$@" -Wno-error\n' "$HOME" > ~/.local/cc/cc && chmod +x ~/.local/cc/cc
# ar via Zig
printf '#!/bin/sh\nexec %s/.local/zig/zig ar "$@"\n' "$HOME" > ~/.local/cc/ar && chmod +x ~/.local/cc/ar
# libcrypt.so.1 extraída de libcrypt1
LD_LIBRARY_PATH=/tmp/opencode/libcrypt-lib/usr/lib/x86_64-linux-gnu
# staging fora do tmpfs
TMPDIR=/home/<user>/tmp-build
```
