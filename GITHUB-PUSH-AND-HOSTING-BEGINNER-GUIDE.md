# CAMS GitHub Push and Website Hosting Guide

Beginner-friendly manual for the CAMS project

Last updated: 8 October 2026

---

## 1. What this guide teaches

This guide teaches you how to:

1. Understand Git and GitHub.
2. Open the correct CAMS folder in Terminal.
3. check your changes before uploading them.
4. protect passwords and private configuration.
5. create a Git commit.
6. push your branch to GitHub.
7. merge your work into the `main` branch.
8. publish the CAMS frontend with GitHub Pages.
9. upload later updates.
10. understand and fix common Git errors.

You should type the commands yourself, one line at a time. Press **Enter** after every command.

---

## 2. Important: GitHub and GitHub Pages are different

### GitHub repository

A GitHub repository stores your project source code:

- CAMS webpage code
- CAMS API code
- Docker configuration
- ESP32 firmware
- project documentation

### GitHub Pages

GitHub Pages publishes static browser files such as:

- HTML
- CSS
- JavaScript
- images

GitHub Pages **cannot run** your complete CAMS Docker system. It cannot directly run:

- the Node.js CAMS API
- MongoDB
- Mosquitto MQTT
- Docker Compose
- server-side authentication

Therefore, GitHub Pages can host the CAMS frontend, but working login and live MQTT data require the CAMS backend to be deployed separately on an HTTPS server.

Your full system remains:

```text
PLC → ESP32-S3 → Wi-Fi → Mosquitto MQTT → CAMS API → MongoDB → Dashboard
```

GitHub Pages provides only the last browser-facing frontend part.

---

## 3. Your current CAMS Git information

Your local Git repository is:

```text
/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage
```

Your connected GitHub repository is:

```text
https://github.com/gowtham-protovolt/cams-webpage
```

Your current working branch is:

```text
feature/esp32-rs485-telemetry
```

Your project already contains a GitHub Pages deployment workflow:

```text
.github/workflows/pages.yml
```

That workflow publishes the `cams-webpage` folder when changes reach `main` or `feature/github-pages-hosting`.

---

## 4. Small Git glossary

| Word | Simple meaning |
|---|---|
| Repository | The project tracked by Git |
| Local | Files stored on your Mac |
| Remote | The GitHub copy of the project |
| Branch | An independent line of development |
| `main` | The primary production branch |
| Stage | Select changes for the next commit |
| Commit | A saved checkpoint with a message |
| Push | Upload local commits to GitHub |
| Pull | Download new GitHub commits |
| Merge | Combine one branch into another |
| Pull Request | GitHub page used to review and merge a branch |
| Origin | The usual name for the connected GitHub repository |

The normal workflow is:

```text
Edit files → Check changes → Stage → Commit → Push → Pull Request → Merge → Deploy
```

---

## 5. Before starting

You need:

- a GitHub account
- Git installed
- internet access
- access to `gowtham-protovolt/cams-webpage`
- the CAMS project on your Mac

Open **VS Code**, then choose:

```text
Terminal → New Terminal
```

You may also use the macOS Terminal application.

---

## 6. Enter the correct project folder

Run:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage"
```

Why quotation marks are required: the folder name contains spaces.

Confirm your location:

```bash
pwd
```

Expected result:

```text
/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage
```

View the project files:

```bash
ls
```

You should see folders such as:

```text
cams-api
cams-webpage
esp32-rs485-gateway
```

Do not run the remaining Git commands from `cams-api` or the inner `cams-webpage` directory. Run them from the repository root shown above.

---

## 7. Confirm Git is installed

Run:

```bash
git --version
```

Example output:

```text
git version 2.x.x
```

If Git is missing on macOS, run:

```bash
xcode-select --install
```

Complete the Apple installer, reopen Terminal and run `git --version` again.

---

## 8. Configure your Git name and email

Check the current values:

```bash
git config --global user.name
```

```bash
git config --global user.email
```

If they are empty or incorrect, set them. Replace the examples with your own details:

```bash
git config --global user.name "Your Name"
```

```bash
git config --global user.email "your-github-email@example.com"
```

Confirm them:

```bash
git config --global --list
```

Use an email connected to your GitHub account if you want GitHub to associate commits with your profile.

---

## 9. Confirm the repository and remote

Check the current branch:

```bash
git branch --show-current
```

For the current CAMS work, the result should be:

```text
feature/esp32-rs485-telemetry
```

Check the connected GitHub repository:

```bash
git remote -v
```

Expected result:

```text
origin  https://github.com/gowtham-protovolt/cams-webpage.git (fetch)
origin  https://github.com/gowtham-protovolt/cams-webpage.git (push)
```

Meaning:

- `origin` is the short name for the GitHub repository.
- `fetch` downloads from GitHub.
- `push` uploads to GitHub.

Do not run `git init` again because this folder is already a Git repository.

---

## 10. Security check before every push

Never upload these files:

- `.env`
- `secrets.h`
- Wi-Fi passwords
- MQTT passwords
- MongoDB passwords
- API keys
- private certificates or keys
- personal access tokens

The CAMS `.gitignore` already ignores `.env` files. Confirm it:

```bash
git check-ignore -v cams-api/.env
```

If the file exists and is ignored, Git prints the matching `.gitignore` rule.

Check whether the real `.env` was accidentally tracked:

```bash
git ls-files cams-api/.env
```

Correct result: no output.

Check whether the ESP32 real secret file was accidentally tracked:

```bash
git ls-files esp32-rs485-gateway/include/secrets.h
```

Correct result: no output.

Search the staged files before committing:

```bash
git diff --cached --name-only
```

Files such as `.env.example` and `secrets.example.h` are safe only when they contain placeholders—not real passwords.

If a private file is tracked accidentally, stop before pushing. Remove only the Git-tracked copy while keeping the local file:

```bash
git rm --cached cams-api/.env
```

Then confirm that `.env` is listed in `.gitignore`.

Never paste a GitHub token or password into a source file, documentation file, screenshot or chat.

---

## 11. Review your current changes

Show changed files:

```bash
git status
```

Shorter view:

```bash
git status --short
```

Meaning of common symbols:

```text
M   modified file
??  new untracked file
D   deleted file
A   newly staged file
```

See a summary of line changes:

```bash
git diff --stat
```

See the actual unstaged code changes:

```bash
git diff
```

Press `q` if Git opens a long scrollable result.

This review is important. Do not upload files that you do not understand.

---

## 12. Test CAMS before committing

Run the frontend validation:

```bash
cd cams-webpage
```

```bash
npm test
```

Return to the repository root:

```bash
cd ..
```

Run the backend tests:

```bash
cd cams-api
```

```bash
npm test
```

Return to the repository root:

```bash
cd ..
```

If a test fails, read the failure and fix it before pushing.

Optional Docker verification:

```bash
cd cams-api
```

```bash
docker compose up -d --build
```

```bash
docker compose ps
```

```bash
cd ..
```

Open the local application:

```text
http://localhost:3100
```

---

## 13. Stage your changes

First confirm that you are at the repository root:

```bash
pwd
```

Stage all non-ignored project changes:

```bash
git add .
```

`git add .` does not upload anything. It only selects the changes for the next commit.

Review exactly what is staged:

```bash
git status
```

Show only staged filenames:

```bash
git diff --cached --name-only
```

Review the staged code:

```bash
git diff --cached
```

If you staged the wrong file, unstage it without deleting it:

```bash
git restore --staged PATH/TO/FILE
```

Example:

```bash
git restore --staged README.md
```

---

## 14. Create a commit

Create a clear checkpoint:

```bash
git commit -m "Complete CAMS live monitoring dashboard and settings"
```

A good commit message briefly explains the completed change.

Check the newest commit:

```bash
git log -1 --oneline
```

Check that the working tree is clean:

```bash
git status
```

If more files still need to be committed, review them before creating another commit.

---

## 15. Sign in to GitHub from Terminal

GitHub no longer accepts your normal account password for HTTPS Git pushes.

### Recommended method: GitHub CLI

Check whether GitHub CLI is installed:

```bash
gh --version
```

If it is installed, sign in:

```bash
gh auth login
```

Select:

1. `GitHub.com`
2. `HTTPS`
3. `Login with a web browser`

Copy the temporary code shown in Terminal, complete authentication in the browser, and return to Terminal.

Confirm authentication:

```bash
gh auth status
```

### Alternative: personal access token

If Git requests a username and password during `git push`:

- Username: your GitHub username
- Password: a GitHub personal access token, not your normal GitHub password

Treat a personal access token exactly like a password. Never save it in the CAMS project.

---

## 16. Push the current CAMS branch

Confirm the branch:

```bash
git branch --show-current
```

Push the current branch:

```bash
git push -u origin feature/esp32-rs485-telemetry
```

Explanation:

- `git push` uploads commits.
- `-u` connects the local branch to its GitHub branch.
- `origin` means your GitHub repository.
- `feature/esp32-rs485-telemetry` is the branch name.

After the first successful push, later pushes from this same branch can use:

```bash
git push
```

Confirm the remote branch exists:

```bash
git branch -r
```

You should see:

```text
origin/feature/esp32-rs485-telemetry
```

---

## 17. Create and merge a Pull Request

Pushing the feature branch does not automatically place the work in `main`.

Open:

```text
https://github.com/gowtham-protovolt/cams-webpage
```

GitHub may show a **Compare & pull request** button.

1. Click **Compare & pull request**.
2. Confirm the base branch is `main`.
3. Confirm the compare branch is `feature/esp32-rs485-telemetry`.
4. Enter a title, for example:

   ```text
   Complete CAMS live monitoring dashboard and settings
   ```

5. Explain the main changes.
6. Click **Create pull request**.
7. Wait for validation checks to finish.
8. Review the changed files.
9. Click **Merge pull request**.
10. Click **Confirm merge**.

The existing validation workflow tests both the frontend and backend before merging.

### Optional GitHub CLI method

If you prefer Terminal:

```bash
gh pr create --base main --head feature/esp32-rs485-telemetry --title "Complete CAMS live monitoring dashboard and settings" --body "Adds live monitoring, machine status, trends, alarms, settings and Docker integration."
```

Do not merge until the checks pass.

---

## 18. Update your local `main` after merging

After the Pull Request is merged on GitHub, run:

```bash
git switch main
```

```bash
git pull origin main
```

Confirm the latest commit:

```bash
git log -1 --oneline
```

Your local `main` and GitHub `main` should now contain the same work.

---

## 19. Enable GitHub Pages

Your repository already contains an automatic Pages workflow. Use **GitHub Actions** as the publishing source.

On GitHub:

1. Open `https://github.com/gowtham-protovolt/cams-webpage`.
2. Click **Settings**.
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment**, choose **GitHub Actions** as the source.
5. Open the repository’s **Actions** tab.
6. Select **Deploy CAMS to GitHub Pages**.
7. Wait until the workflow shows a green check mark.
8. Return to **Settings → Pages**.
9. Click **Visit site**.

The expected public URL is:

```text
https://gowtham-protovolt.github.io/cams-webpage/
```

GitHub says publishing can take several minutes after a push. Refresh after the workflow completes.

---

## 20. Frontend preview versus fully working CAMS

### Preview-only deployment

If you publish without a public API URL:

- the webpage files are publicly hosted
- the login screen loads
- backend authentication does not work
- live MQTT telemetry does not work
- MongoDB data is unavailable

This is expected because GitHub Pages is static hosting.

### Fully working deployment

For a fully working public CAMS application, you must first deploy the Docker backend to an HTTPS server.

You will need a backend address similar to:

```text
https://api.your-domain.com
```

Then add it to the GitHub repository:

1. Open the repository on GitHub.
2. Click **Settings**.
3. Click **Secrets and variables**.
4. Click **Actions**.
5. Select the **Variables** tab.
6. Click **New repository variable**.
7. Name it:

   ```text
   CAMS_API_URL
   ```

8. Set the value to your HTTPS API address.
9. Save it.
10. Run the Pages workflow again.

The deployment workflow automatically writes this address into the published `runtime-config.js`.

Do not set this variable to:

```text
http://localhost:3100
```

`localhost` means the visitor’s own computer, not your Mac or server.

The production backend must also be configured for:

- HTTPS
- the GitHub Pages address in `CORS_ORIGINS`
- secure cookies
- `SameSite=None` when frontend and API use different sites
- a production MongoDB service
- a production MQTT broker
- firewall and backup policies

This backend deployment is a separate task from pushing source code to GitHub.

---

## 21. How to publish later changes

Create a new branch for the next piece of work:

```bash
git switch main
```

```bash
git pull origin main
```

```bash
git switch -c feature/SHORT-DESCRIPTION
```

Example:

```bash
git switch -c feature/device-management
```

After making and testing changes:

```bash
git status
```

```bash
git diff
```

```bash
git add .
```

```bash
git diff --cached --name-only
```

```bash
git commit -m "Add CAMS device management"
```

```bash
git push -u origin feature/device-management
```

Then create a Pull Request into `main`. After it is merged, the Pages workflow automatically republishes the frontend.

---

## 22. Useful daily commands

### Show the current branch

```bash
git branch --show-current
```

### Show file changes

```bash
git status --short
```

### Download information about remote branches

```bash
git fetch origin
```

### Update the current branch safely

```bash
git pull --ff-only
```

### Show recent commits

```bash
git log --oneline -10
```

### Show connected remotes

```bash
git remote -v
```

### Show unstaged changes

```bash
git diff
```

### Show staged changes

```bash
git diff --cached
```

### Unstage a file without deleting it

```bash
git restore --staged PATH/TO/FILE
```

### Discarding changes

Do not run destructive commands such as `git reset --hard` or `git clean -fd` while learning. They can permanently remove work.

---

## 23. Common problems and solutions

### Problem: `fatal: not a git repository`

Cause: Terminal is in the wrong directory.

Fix:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage"
```

Then run:

```bash
git status
```

### Problem: `Authentication failed`

Cause: GitHub does not accept your normal account password for Git over HTTPS.

Fix:

```bash
gh auth login
```

Use browser authentication, or use a personal access token when Git asks for a password.

### Problem: `rejected` or `non-fast-forward`

Cause: GitHub contains commits that your local branch does not have.

First save or commit your local changes. Then run:

```bash
git pull --rebase origin YOUR-BRANCH-NAME
```

Resolve any conflicts carefully, test again and run:

```bash
git push
```

Never use `git push --force` on `main`.

### Problem: `src refspec main does not match any`

Cause: your current branch is not named `main`, or the repository has no commit.

Check:

```bash
git branch --show-current
```

Push the actual branch name instead.

### Problem: GitHub Pages shows 404

Check:

1. The Pull Request was merged into `main`.
2. **Settings → Pages** uses **GitHub Actions**.
3. The **Deploy CAMS to GitHub Pages** workflow passed.
4. You are using the full URL with `/cams-webpage/`.
5. Wait several minutes after deployment.

### Problem: webpage opens but login says service unavailable

Cause: GitHub Pages has no running CAMS backend, or `CAMS_API_URL` is empty/wrong.

Fix: deploy the backend to HTTPS and configure the `CAMS_API_URL` repository variable.

### Problem: workflow rejects `CAMS_API_URL`

The deployment script requires an HTTPS URL in production.

Correct:

```text
https://api.example.com
```

Incorrect:

```text
http://api.example.com
http://localhost:3100
```

### Problem: GitHub reports a secret in the commit

Do not bypass the warning. Remove the secret from the file and rotate the exposed password or token immediately.

If a real secret was already pushed, deleting it from the newest file is not enough because it remains in Git history. Rotate the secret first, then follow GitHub’s sensitive-data removal instructions.

---

## 24. From-scratch repository commands for learning

Your CAMS repository is already configured, so you do **not** need this section now. It shows the general process for a brand-new local project.

```bash
cd "/path/to/new-project"
```

```bash
git init
```

```bash
git branch -M main
```

```bash
git add .
```

```bash
git commit -m "Initial project commit"
```

Create an empty repository on GitHub without adding a README, `.gitignore` or license. Then connect it:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
```

```bash
git push -u origin main
```

Do not run these from-scratch commands inside the existing CAMS repository.

---

## 25. Final checklist

Before pushing:

- [ ] I am in the correct repository directory.
- [ ] I checked `git status`.
- [ ] I reviewed `git diff`.
- [ ] `.env` is ignored and not tracked.
- [ ] `secrets.h` is ignored and not tracked.
- [ ] No password, token or private key is staged.
- [ ] Frontend tests pass.
- [ ] Backend tests pass.
- [ ] Docker works locally when required.
- [ ] I reviewed `git diff --cached`.
- [ ] I wrote a clear commit message.
- [ ] I pushed the feature branch—not directly to `main`.
- [ ] I created a Pull Request.
- [ ] GitHub checks passed before merging.
- [ ] GitHub Pages deployment passed.

---

## 26. Exact command summary for your current CAMS project

Use these commands one by one after reviewing the full guide:

```bash
cd "/Users/gowtham/Downloads/ESP32-S3-LCD-2.8-Demo 2/cams-webpage"
```

```bash
git branch --show-current
```

```bash
git remote -v
```

```bash
git status
```

```bash
git diff --stat
```

```bash
git check-ignore -v cams-api/.env
```

```bash
git ls-files cams-api/.env
```

```bash
git ls-files esp32-rs485-gateway/include/secrets.h
```

```bash
cd cams-webpage
```

```bash
npm test
```

```bash
cd ..
```

```bash
git add .
```

```bash
git diff --cached --name-only
```

```bash
git diff --cached
```

```bash
git commit -m "Complete CAMS live monitoring dashboard and settings"
```

```bash
git push -u origin feature/esp32-rs485-telemetry
```

Then open GitHub, create a Pull Request into `main`, wait for checks, merge it and verify the Pages deployment.

---

## 27. Official references

- [Adding locally hosted code to GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Configuring a GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub command-line authentication](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github)
- [Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

