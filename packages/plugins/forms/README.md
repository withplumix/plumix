# @plumix/plugin-forms

Forms for Plumix, declared in config, rendered as a block, with stored submissions.

## Install

```bash
pnpm add @plumix/plugin-forms
```

## Documentation

Read the [documentation](https://docs.plumix.dev/plugins/forms/) on docs.plumix.dev.

## Outside systems

- Cloudflare Turnstile verifies a form's captcha answer on submit (`src/server/turnstile.ts`), and the visitor's browser loads its widget from Cloudflare (`src/block/form-captcha.ts`).

## Support

Ask questions in [Discussions](https://github.com/withplumix/plumix/discussions) and report bugs in [Issues](https://github.com/withplumix/plumix/issues). Report a security issue privately, as the [security policy](https://github.com/withplumix/plumix/blob/main/SECURITY.md) describes.

## Contributing

Start with the [contributing guide](https://github.com/withplumix/plumix/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/withplumix/plumix/blob/main/LICENSE) © Plumix Contributors
