{ pkgs, ... }:
let
  ts-root = ../../app;
in
pkgs.bun2nix.mkDerivation {
  pname = "judge-app-test";
  src = ts-root;
  version = "v1.0.0";
  bunDeps = pkgs.bun2nix.fetchBunDeps {
    bunNix = ../bun.nix;
  };

  dontUseBunBuild = true;
  dontUseBunCheck = true;

  # Custom install: copy source + node_modules, then write a named wrapper.
  # The default installPhase expects a compiled binary (judge-app-test) which
  # dontUseBunBuild prevents from ever being built.
  installPhase = ''
        runHook preInstall

        mkdir -p $out/bin $out/lib/judge-app-test
        cp -r . $out/lib/judge-app-test

        cat > $out/bin/app-test << WRAPPER
    #!/bin/sh
    export HOME=/tmp
    cd "$out/lib/judge-app-test"
    exec "${pkgs.bun}/bin/bun" run test-nix
    WRAPPER
        chmod +x $out/bin/app-test

        runHook postInstall
  '';
}
