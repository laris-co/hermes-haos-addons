# Hello World

A deliberately small Home Assistant sidebar app. It proves the complete app
delivery path without hiding the important mechanics behind a framework.

## What it demonstrates

- a multi-architecture, explicitly pinned Home Assistant base image;
- nginx serving one self-contained page on the standard ingress port `8099`;
- Home Assistant authentication and sidebar embedding through ingress;
- no published port, credentials, API permissions, mapped folders, or host
  privileges.

Install it from this repository, start it, enable **Show in sidebar**, then open
**Hello World** from Home Assistant's navigation.
