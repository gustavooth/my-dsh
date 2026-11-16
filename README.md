# DeepSeek Harness

Fork do [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) com algumas alterações.

## Requisitos (Linux x64)

- Node.js `>= 24.9` (testado com 24.21.0).
- pnpm `11.28.5` (fixado em `package.json`).
- `build-essential`, `python3`, `pkg-config`, `libssl-dev`, `xz-utils` e `libcrypt1`.

## Build para Linux

```sh
pnpm install
pnpm run build

# pacote .deb (linux x64, sem assinatura)
pnpm run package:desktop:linux:x64:unsigned
```

O `.deb` é gerado em `apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/`.

Para abrir o app em modo desenvolvimento:

```sh
pnpm run dev:desktop
```

Dependências do sistema, toolchain e solução de problemas: [DEBIAN-PACKAGING.md](DEBIAN-PACKAGING.md).

## Licença

[MIT](LICENSE). Avisos de terceiros em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

README editado usando o próprio DeepSeek Harness.
