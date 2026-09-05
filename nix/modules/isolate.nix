{
  pkgs,
  lib,
  config,
  ...
}:
let
  cfg = config.isolate;
in
{
  options.isolate = {
    enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to enable the isolate module and related services";
    };

    fixEnvironment = lib.mkOption {
      type = lib.types.enum [
        "disabled"
        "enabled"
        "verbose"
      ];
      default = "enabled";
      description = ''
        Run isolate-check-environment -e if set to "enabled" or "verbose".
        If 'verbose', isolate-check-environment runs for a second pass to print
        diagnostic information and ensure that all of the fixes were applied
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    security.isolate = {
      enable = true;
    };

    systemd.services.isolate-setup = lib.mkIf (cfg.fixEnvironment != "disabled") {
      description = "Setup cgroups and environment for isolate";
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
      };
      path = [ "/run/current-system/sw" ];

      # if verbose, the additional script logic is added to run a
      # second pass for debugging purposes.
      script = ''
        # check environment
        echo ">>> PRE-FIX ISSUES:"
        ${pkgs.isolate}/bin/isolate-check-environment -e || true

        ${lib.optionalString (cfg.fixEnvironment == "verbose") ''
          echo ">>> POST-FIX ISSUES:"
          if ! ${pkgs.isolate}/bin/isolate-check-environment; then
            echo "NOTE: isolate-check-environment returned non-zero value: $?";
            echo "NOTE: this could be because the script cannot detect if the CPU"
            echo "      has both P & E cores, in which case this can be ignored."
          fi
        ''}
      '';

      after = [
        "systemd-cgroupv2-setup.service"
        "systemd-sysctl.service"
        "local-fs.target"
      ];
      requires = [
        "systemd-sysctl.service"
      ];
    };
  };
}
