import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useI18n } from "../i18n";
import { appStyles } from "../styles";

type Props = {
  username: string;
  setUsername: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  token: string;
  onLogin: () => void;
};

export function AuthCard(props: Props) {
  const { t } = useI18n();
  return (
    <View style={appStyles.authCard}>
      <Text style={appStyles.authCardTitle}>{t("auth.title")}</Text>
      <TextInput
        style={appStyles.authInput}
        value={props.username}
        onChangeText={props.setUsername}
        autoCapitalize="none"
        placeholder={t("auth.username")}
        placeholderTextColor="#8ba09d"
      />
      <TextInput
        style={appStyles.authInput}
        value={props.password}
        onChangeText={props.setPassword}
        secureTextEntry
        placeholder={t("auth.password")}
        placeholderTextColor="#8ba09d"
      />
      <Pressable style={({ pressed }) => [appStyles.authButton, pressed ? appStyles.authButtonPressed : undefined]} onPress={props.onLogin}>
        <Text style={appStyles.authButtonText}>{props.token ? t("auth.refresh_token") : t("auth.login_token")}</Text>
      </Pressable>
      {props.token ? <Text style={appStyles.authTokenPreview}>{t("auth.active_token", { value: props.token.slice(0, 12) })}</Text> : null}
    </View>
  );
}
