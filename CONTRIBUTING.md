# Contributing to @curvelabs.org/thinkfeel

Thank you for your interest in contributing to the ThinkFeel SDK!

## Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/artificial-affect/thinkfeel-sdk.git
   cd thinkfeel-sdk
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Project Structure

```
src/
├── client.ts       # Main ThinkFeel class implementation
├── types.ts        # TypeScript type definitions
└── index.ts        # Public API exports
```

## Making Changes

1. Make your changes in the `src/` directory
2. Build the project: `npm run build`
3. Test your changes locally
4. Submit a pull request

## Code Style

- Use TypeScript for all code
- Follow the existing code style
- Add JSDoc comments for public APIs
- Ensure all types are properly defined

## Testing Locally

To test your changes before submitting:

```bash
# Build the package
npm run build

# Create a test package
npm pack

# In another project, install the local package
npm install /path/to/curvelabs.org-thinkfeel-0.1.0.tgz
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Submit a pull request

## Questions?

Contact us at [curvelabs.org/support](https://curvelabs.org/support)
