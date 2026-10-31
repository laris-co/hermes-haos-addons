# Hello World on a fresh Home Assistant OS — from first boot to a sidebar app

This walkthrough takes a brand-new Home Assistant OS virtual machine, finishes onboarding, adds
this repository to the App Store, and installs the [Hello World](../../hello-world/) app. Home
Assistant's Supervisor builds the app on the machine itself, then opens it in the sidebar through
ingress: no published port, no credentials, no API access.

Every screenshot is from one real run on 2026-10-31: Home Assistant OS 18.3 (aarch64) in UTM on an
Apple Silicon Mac, the HAOS workshop VM image. Any Home Assistant OS install with internet access
follows the same steps.

| | |
|---|---|
| Time | about 6 minutes, most of it the first-boot download |
| You need | a Home Assistant OS machine and a browser on the same network |
| You end with | an app in the sidebar that Home Assistant built from source on your machine |

The VM's address is written `<vm-ip>` below: find yours on the VM console (the `ha >` banner shows
it) or in your router. Home Assistant answers on port 80 here; `:8123` redirects to it.

## 1. First boot: Home Assistant downloads its Core

Open `http://<vm-ip>` in a browser. On the very first boot the page says **Preparing Home Assistant**
while the Supervisor downloads the Home Assistant Core image. It needs internet. In this run it took
about 70 seconds; on a slow line it can take 20 minutes, as the page says.

![Preparing Home Assistant, a progress bar half full, and the note that the download may take 20 minutes](images/01-preparing.png)

## 2. Onboarding

When the download finishes the page turns into **Welcome!**. Click **Create my smart home**.

![The Welcome page with the Create my smart home button and the restore options below it](images/02-welcome.png)

Create the owner account: a name, a username and a password. This account is the administrator of
the machine, so keep the password somewhere safe.

![The Create user form with Name and Username filled in as Workshop and both password fields masked](images/03-create-user.png)

**Home location** starts at a default point (Amsterdam). You can search for your city or press the
target button to detect it; for a practice machine the default is fine. Click **Next**.

![The Home location step with a map of central Amsterdam and the address search box](images/04-location.png)

Pick your **Country** so the units are right. This run used Thailand. Click **Next**.

![The country step with Thailand selected](images/05-country.png)

**Help us help you** asks which anonymous statistics to share. All four switches start off; leave
them off unless you want to share. Click **Next**.

![The analytics step with Basic analytics, Usage, Statistical data and Diagnostics all switched off](images/06-analytics.png)

Home Assistant lists devices it found on your network. Click **Finish**. (The names are blanked in
this picture because they belong to the network the run happened on.)

![We found compatible devices, three entries blanked out as device on your network, and the Finish button](images/07-found-devices.png)

You land on the **Overview** dashboard.

![The Overview dashboard saying Welcome Workshop, with Living Room, Kitchen and Bedroom areas](images/08-overview.png)

## 3. Open the App Store

Click **Settings** in the sidebar, then **Apps**. (Older Home Assistant versions call them
add-ons; the steps are the same.)

![The Settings page with Devices and services, Automations and the other sections](images/09-settings.png)

A new machine has no apps. Click **Install app** to open the App Store.

![The Apps page saying you don't have any apps installed yet, with the Install app button](images/10-apps-empty.png)

The store lists the official apps.

![The App store with the official apps such as File editor, Mosquitto broker and Samba share](images/11-app-store.png)

## 4. Add this repository

Open the **⋮** menu at the top right and choose **Repositories**.

![The App store with its menu open: Check for updates, Repositories, Reload](images/12-store-menu.png)

The list is empty. Click **Add**.

![The Repositories page saying you don't have any app repositories configured](images/13-repositories-empty.png)

Paste the repository URL and click **Add**:

```text
https://github.com/laris-co/hermes-haos-addons
```

![The Add repository dialog with the hermes-haos-addons URL typed in](images/14-add-repository.png)

The repository appears as **Hermes Agent (unofficial)**, with its maintainer and URL. Home Assistant
clones it in the background.

![The Repositories list showing Hermes Agent (unofficial), maintainer laris-co, and the GitHub URL](images/15-repository-added.png)

## 5. Install Hello World

Back in the App Store, type `hello` in the search box. The new section **Hermes Agent (unofficial)**
shows **Hello World** (and Hello HAOS Oracle, its sibling).

![The App store filtered to hello: Hello World and Hello HAOS Oracle under Hermes Agent (unofficial)](images/16-store-hello.png)

Open **Hello World** and click **Install**.

![The Hello World app page, version 1.0.0, with the Experimental and Ingress badges and the Install button](images/17-app-page.png)

The button turns into a spinner while the Supervisor works.

![The Install button replaced by a loading spinner](images/18-installing.png)

What happens behind that spinner is a real build on your machine. The Supervisor log (Settings →
System → Logs → Supervisor, search `hello_world`) shows it:

```text
13:43:43 Cloning app repository from https://github.com/laris-co/hermes-haos-addons
13:44:30 Starting build for a90308c2/aarch64-addon-hello_world:1.0.0
13:44:30 Running command docker buildx build . --platform linux/arm64 --pull ... BUILD_ARCH=aarch64
13:44:47 Build a90308c2/aarch64-addon-hello_world:1.0.0 done
13:44:47 App 'a90308c2_hello_world' successfully installed
```

The image was built for `aarch64` because this machine is ARM; on an Intel or AMD machine the same
repository builds an `amd64` image. The build took 17 seconds here.

![The Supervisor log filtered to hello_world: build started, docker buildx command, build done, installed, ingress panel, started](images/24-supervisor-build.png)

## 6. Show it in the sidebar and start it

When the install finishes the app is **Stopped**, with its switches below the Start button.

![Hello World installed and stopped, with Start, Start on boot, Watchdog, Auto update and Show in sidebar](images/19-installed.png)

Turn on **Show in sidebar**. Ingress alone gives the app a page; this switch is what puts it in the
navigation.

![The Show in sidebar switch turned on](images/20-sidebar-on.png)

Click **Start**. The badge changes to **Running**, the controls become Stop and Restart, and **Hello
World** appears in the sidebar under History.

![Hello World running, with Open Web UI, the Stop and Restart buttons, and Hello World in the sidebar](images/21-started.png)

## 7. Open it

Click **Hello World** in the sidebar.

![The Hello World page inside Home Assistant: a waving hand, Hello catlab, and the badges Ingress authenticated, No published port, Zero secrets](images/22-hello-world.png)

The page is served by nginx inside the app container, on ingress port `8099`, and Home Assistant
shows it inside its own frame. Your browser never talks to the container directly: every request
goes through your Home Assistant login. The greeting says **catlab** because that is the machine the
app was first written for; it is fixed text in [`hello-world/index.html`](../../hello-world/index.html).

The app's own **Log** tab shows the container starting under s6-overlay.

![The Log tab with s6-rc service start lines](images/23-app-log.png)

## Troubleshooting

| You see | Why | Do |
|---|---|---|
| "Preparing Home Assistant" for a long time | first boot downloads Home Assistant Core | wait; check the VM has internet |
| The app is running but not in the sidebar | ingress creates the page, the sidebar entry is a separate switch | turn on **Show in sidebar** on the app's Info tab |
| Nothing answers at `http://<vm-ip>:8099` | the app publishes no port, and its nginx accepts only the Supervisor's ingress proxy (`172.30.32.2`), by design | open it from the sidebar or **Open Web UI** |
| A change you pushed doesn't show up | the Supervisor keeps the image of the same version | bump `version` in `config.yaml`, reload the store, update the app |
| "We found compatible devices" lists your gear | Home Assistant scans your network during onboarding | expected; add them later or ignore them |

## How the app is put together

| File | Role |
|---|---|
| [`config.yaml`](../../hello-world/config.yaml) | app metadata: `ingress: true`, `ingress_port: 8099`, `panel_icon`, both architectures, no API access, no host network |
| [`Dockerfile`](../../hello-world/Dockerfile) | `FROM` a pinned Home Assistant base image (by digest), installs nginx, copies the page and its config |
| [`ingress.conf`](../../hello-world/ingress.conf) | nginx listens on 8099 and allows only `172.30.32.2`, the Supervisor's ingress proxy |
| [`index.html`](../../hello-world/index.html) | one self-contained page: no external assets, so it works under the ingress path prefix |
