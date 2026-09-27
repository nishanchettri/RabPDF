# Upload RabPDF to GitHub

## Option 1: GitHub website

GitHub's browser uploader is suitable for the source files, but individual uploads are limited in size. The included `release/RabPDF.exe` is about 39 MB and should fit GitHub's normal per-file limit.

1. Sign in to GitHub and choose **New repository**.
2. Name it `RabPDF` and leave **Initialize this repository** unchecked.
3. Create the repository.
4. On the empty repository page, choose **uploading an existing file**.
5. Drag the contents of this folder into the page, including hidden `.github` files.
6. Commit the upload to the `main` branch.

Uploading through Git is more reliable because browsers may omit hidden folders.

## Option 2: Git command line

Open PowerShell inside this folder and run:

```powershell
git init -b main
git add .
git commit -m "Initial RabPDF release"
git remote add origin https://github.com/YOUR-USERNAME/RabPDF.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username. Create the empty GitHub repository before running the final two commands.

## Publishing future executables

GitHub Actions builds a new Windows executable after every push to `main`.

1. Open the repository's **Actions** tab.
2. Open the latest **Test and build Windows EXE** run.
3. Download the `RabPDF-Windows` artifact.
4. For public releases, create a GitHub Release and attach the resulting `RabPDF.exe`.

Do not commit `.venv`, `build`, or `dist`; they are intentionally ignored.
