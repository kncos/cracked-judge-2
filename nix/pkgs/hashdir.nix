#!/bin/bash
{
  pkgs ? import <nixpkgs> { },
}:
pkgs.writeShellApplication {
  name = "hashdir";

  runtimeInputs = [
    pkgs.coreutils # sha256sum, sort
    pkgs.findutils # find, xargs
    pkgs.gawk # awk
  ];

  text = ''
    if [ $# -lt 1 ] || [ ! -d "$1" ]; then
      echo "USAGE: $0 <directory>"
      exit 1
    fi

    cd "$1"

    find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}'
  '';
}
