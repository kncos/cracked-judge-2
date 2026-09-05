{ pkgs, ... }:
let
  ts-root = ../../app;
in
pkgs.bun2nix.mkDerivation {
  pname = "judge-app-test";
  src = ts-root;
  packageJson = "${ts-root}/package.json";
  version = "v1.0.0";
  bunDeps = pkgs.bun2nix.fetchBunDeps {
    bunNix = ../bun.nix;
  };

  dontUseBunBuild = true;
  dontUseBunCheck = true;

  startScript = ''
    bun run test-nix
  '';
}
