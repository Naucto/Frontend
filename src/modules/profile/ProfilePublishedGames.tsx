import React from "react";
import ProfileGamesSeeAllBase from "@modules/profile/ProfileGamesSeeAllBase";

export const ProfilePublishedGames: React.FC = () => {
  return (
    <ProfileGamesSeeAllBase
      title="Published games"
      type="published"
      emptyLabel="No published games yet."
    />
  );
};

export default ProfilePublishedGames;
