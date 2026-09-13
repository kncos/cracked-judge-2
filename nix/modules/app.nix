{
  pkgs,
  lib,
  config,
  ...
}:
let
  cfg = config.services.app;
  app = pkgs.callPackage ../pkgs/app.nix { };
in
{
  options.services.app = {
    enable = lib.mkEnableOption "app";
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ app ];

    systemd.services.app = {
      description = "App";
      wantedBy = [ "multi-user.target" ];

      serviceConfig = {
        ExecStart = "${pkgs.bash}/bin/bash -lc 'exec ${app}/bin/judge-app'";
        Restart = "on-failure";
        RestartSec = "1s";
        TimeoutStopSec = 60;
        KillSignal = "SIGTERM";
        StartLimitBurst = 3;
        StartLimitIntervalSec = 30;
      };
    };
  };
}
