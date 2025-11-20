# Publishing @curvelabs.org/thinkfeel

## ✅ Pre-Publish Checklist

Everything is ready:

- ✅ Package name: `@curvelabs.org/thinkfeel`
- ✅ Version: `0.1.0`
- ✅ Built and compiled to `dist/`
- ✅ README, LICENSE, CONTRIBUTING docs ready
- ✅ Repository URL: `https://github.com/artificial-affect/thinkfeel-sdk`

## 🚀 Step 1: Fix npm Cache (One-Time)

First, fix the npm cache permission issue:

```bash
sudo chown -R $(whoami) "/Users/jeremysoo/.npm"
```

## 📦 Step 2: Publish to npm

```bash
cd /Users/jeremysoo/projects/curve-labs-playground/sdk

# Login to npm
npm login
# Username: feeling-machines
# Password: (your password)
# Email: (your email)

# Verify you're logged in
npm whoami
# Should show: feeling-machines

# Publish to npm
npm publish --access public
```

The `--access public` flag is required for scoped packages like `@curvelabs.org/thinkfeel`.

## 📝 Step 3: Push SDK to GitHub

Since the SDK is ignored by the parent repo, you need to create its own git repo:

```bash
cd /Users/jeremysoo/projects/curve-labs-playground/sdk

# Initialize git
git init
git branch -m main

# Add all files
git add -A

# Create initial commit
git commit -m "Initial release: v0.1.0"
```

## 🌐 Step 4: Create GitHub Repository

1. Go to: https://github.com/organizations/artificial-affect/repositories/new
2. **Repository name**: `thinkfeel-sdk`
3. **Description**: "Official TypeScript/JavaScript SDK for Curve ThinkFeel API"
4. **Visibility**: Public
5. **DO NOT** initialize with README, .gitignore, or license (we have them)
6. Click "Create repository"

## 🔗 Step 5: Push to GitHub

After creating the repo on GitHub:

```bash
cd /Users/jeremysoo/projects/curve-labs-playground/sdk

# Add remote
git remote add origin https://github.com/artificial-affect/thinkfeel-sdk.git

# Push to GitHub
git push -u origin main

# Optional: Create a release tag
git tag v0.1.0
git push --tags
```

## ✅ Step 6: Verify Everything

After publishing:

1. **Check npm**: https://www.npmjs.com/package/@curvelabs.org/thinkfeel
2. **Check GitHub**: https://github.com/artificial-affect/thinkfeel-sdk
3. **Test installation**:
   ```bash
   npm install @curvelabs.org/thinkfeel
   ```

## 🔄 Future Updates

When you make changes:

1. Update version in `package.json` (e.g., `0.1.0` → `0.1.1`)
2. Build: `npm run build`
3. Commit to git:
   ```bash
   cd /Users/jeremysoo/projects/curve-labs-playground/sdk
   git add -A
   git commit -m "Update: description of changes"
   git push
   ```
4. Publish to npm:
   ```bash
   npm publish
   ```
5. Tag the release:
   ```bash
   git tag v0.1.1
   git push --tags
   ```

## 📋 Summary

- **npm package**: `@curvelabs.org/thinkfeel`
- **npm org**: `curvelabs.org` (owned by `feeling-machines`)
- **GitHub org**: `artificial-affect`
- **GitHub repo**: `thinkfeel-sdk`
- **SDK location**: `/Users/jeremysoo/projects/curve-labs-playground/sdk/`
- **Parent repo**: Ignores SDK (in `.gitignore`)

---

**Ready to publish?** Follow steps 1-5 above! 🚀
