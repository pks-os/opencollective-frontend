import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { graphql, compose } from 'react-apollo';
import gql from 'graphql-tag';
import fetch from 'node-fetch';
import { get } from 'lodash';
import { Flex } from '@rebass/grid';
import { Github } from 'styled-icons/fa-brands/Github.cjs';

import withData from '../lib/withData';
import withIntl from '../lib/withIntl';
import withLoggedInUser from '../lib/withLoggedInUser';
import { getBaseApiUrl } from '../lib/utils';

import { Router, Link } from '../server/pages';
import { colors } from '../constants/theme';

import Header from '../components/Header';
import Body from '../components/Body';
import Footer from '../components/Footer';
import { H2, H5, P } from '../components/Text';
import Container from '../components/Container';
import ErrorPage from '../components/ErrorPage';
import StyledLink from '../components/StyledLink';
import StyledButton from '../components/StyledButton';

const { WEBSITE_URL } = process.env;

const defaultPledgedLogo = '/static/images/default-pledged-logo.svg';

class ClaimCollectivePage extends React.Component {
  static getInitialProps({ query }) {
    return {
      slug: query && query.collectiveSlug,
      token: query && query.token,
    };
  }

  static propTypes = {
    data: PropTypes.object.isRequired, // from withData
    claimCollective: PropTypes.func.isRequired, // from addGraphQL/addClaimCollectiveMutation
    slug: PropTypes.string,
    token: PropTypes.string,
  };

  state = {
    error: null,
    loadingUserLogin: true,
    loadingGithub: false,
    LoggedInUser: undefined,
    repo: null,
    memberships: [],
  };

  async componentDidMount() {
    const { getLoggedInUser, token } = this.props;
    const LoggedInUser = await getLoggedInUser();
    this.setState({
      LoggedInUser,
      loadingUserLogin: false,
    });

    const isConnected =
      token &&
      LoggedInUser &&
      LoggedInUser.collective &&
      LoggedInUser.collective.connectedAccounts.some(({ service }) => service === 'github');

    if (isConnected) {
      const githubHandle = this.githubHandle();
      this.setState({ loadingGithub: true });
      if (githubHandle.includes('/')) {
        fetch(`${getBaseApiUrl()}/github/repo?name=${githubHandle}&access_token=${token}`)
          .then(response => response.json())
          .then(repo => {
            this.setState({ loadingGithub: false, repo });
          })
          .catch(() => {
            this.setState({ loadingGithub: false });
          });
      } else {
        fetch(`${getBaseApiUrl()}/github/orgMemberships?access_token=${token}`)
          .then(response => response.json())
          .then(memberships => {
            this.setState({ loadingGithub: false, memberships });
          })
          .catch(() => {
            this.setState({ loadingGithub: false });
          });
      }
    }
  }

  async claim(id) {
    try {
      const {
        data: {
          claimCollective: { slug },
        },
      } = await this.props.claimCollective(id);
      Router.pushRoute('collective', { slug });
    } catch (error) {
      this.setState({ error });
    }
  }

  githubHandle() {
    let githubHandle = get(this.props.data, 'Collective.githubHandle');

    // Transition from website to githubHandle
    const website = get(this.props.data, 'Collective.website');
    if (!githubHandle && website && website.includes('://github.com/')) {
      githubHandle = website.split('://github.com/')[1];
    }

    return githubHandle;
  }

  isAdmin() {
    const githubHandle = this.githubHandle();

    if (githubHandle.includes('/')) {
      // A repository GitHub Handle (most common)
      return get(this.state.repo, 'permissions.admin');
    } else {
      // An organization GitHub Handle
      const membership = this.state.memberships.find(membership => membership.organization.login === githubHandle);
      return get(membership, 'state') === 'active' && get(membership, 'role') === 'admin';
    }
  }

  render() {
    const { data, slug, token } = this.props;
    const { error, LoggedInUser, loadingUserLogin, loadingGithub } = this.state;

    const { Collective, loading } = data;

    if (error) {
      data.error = data.error || error;
    }

    if (loading || error) {
      return <ErrorPage loading={loading} data={data} message={error && error.message} />;
    }

    const connectUrl = `/api/connected-accounts/github?redirect=${WEBSITE_URL}/${slug}/claim`;

    let step, invalid;
    if (loadingUserLogin) {
      step = 'loading';
    } else if (loadingGithub) {
      step = 'analyzing';
    } else if (this.isAdmin()) {
      step = 'valid';
    } else if (token || this.state.repo || this.state.org) {
      step = 'invalid';
      invalid = true;
    } else {
      step = 'initial';
    }

    return (
      <Fragment>
        <Header title={`Claim ${slug}`} className={loadingUserLogin ? 'loading' : ''} LoggedInUser={LoggedInUser} />
        <Body>
          <Container background="linear-gradient(180deg, #DBECFF, #FFFFFF)" py={4}>
            <Container display="flex" flexDirection="column" alignItems="center" mx="auto" maxWidth={1200} py={4}>
              <img src={defaultPledgedLogo} alt="Pledged Collective" />
              <H2 as="h1">{Collective.name}</H2>

              <Container
                bg="white.full"
                border={`1px solid ${invalid ? colors.red[300] : colors.black.transparent[8]}`}
                borderRadius="16px"
                display="flex"
                flexDirection="column"
                maxWidth={500}
                mt={5}
                mx="auto"
                px={[3, 5]}
                py={4}
                width={0.8}
              >
                {step === 'loading' && <P textAlign="center">Loading...</P>}

                {step === 'analyzing' && <P textAlign="center">Analyzing your GitHub permissions...</P>}

                {step === 'initial' && (
                  <Fragment>
                    <H5 textAlign="left" fontWeight="medium" mb={4}>
                      To claim this collective you first need to authenticate with your GitHub account.
                    </H5>

                    <P fontSize="LeadParagraph" textAlign="left" mb={2}>
                      Why are we asking you to do this?
                    </P>

                    <P fontSize="Caption">
                      We need to validate that you have owner rights to the repository linked to this pledged
                      collective.
                    </P>

                    <P fontSize="LeadParagraph" textAlign="left" mb={2} mt={3}>
                      Want to onboard an organization instead of a single repository?
                    </P>

                    <P fontSize="Caption">Make sure to Grant access in the GitHub permission page.</P>

                    <StyledLink
                      buttonStyle="standard"
                      buttonSize="medium"
                      href={connectUrl}
                      fontWeight="medium"
                      maxWidth="220px"
                      mt={4}
                      mx="auto"
                      width={1}
                    >
                      <Flex display="inline-flex" alignItems="center" justifyContent="space-evenly">
                        <Github size={17} color={colors.black[500]} />
                        Authenticate
                      </Flex>
                    </StyledLink>
                  </Fragment>
                )}
                {step === 'invalid' && (
                  <Fragment>
                    <Flex justifyContent="center" mb={4}>
                      <svg
                        id="error"
                        width="66"
                        height="66"
                        viewBox="0 0 66 66"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle cx="33" cy="33" r="32.5" fill="white" stroke={colors.red[300]} />
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M30.7744 21.6268C30.7782 21.6229 30.782 21.619 30.7858 21.6151C31.587 20.7991 34.4029 20.7909 35.2144 21.6151L35.2211 21.6219C35.7825 22.1921 36.0691 22.4833 35.9859 23.2518L34.6038 36.3336C34.562 36.7127 34.2165 37 33.8035 37H32.1967C31.7837 37 31.4366 36.7127 31.3964 36.3336L30.0143 23.2518C29.9313 22.4855 30.2163 22.1952 30.7744 21.6268ZM30 43C30 41.344 31.344 40 33 40C34.658 40 36 41.344 36 43C36 44.656 34.656 46 33 46C31.344 46 30 44.656 30 43Z"
                          fill="#F53152"
                        />
                      </svg>
                    </Flex>

                    <H5 fontWeight="medium" mb={4} textAlign="center">
                      Validation unsuccessful
                    </H5>
                    <P textAlign="center" color="black.600" mb={4}>
                      Sorry, we were unable to succesfully validated your admin status. Try again, or if you believe
                      this is a mistake, please get in touch with the repository owners. Make sure you granted us access
                      as an organization if that&apos;s what you are trying to onboard.
                    </P>
                    <StyledLink
                      buttonStyle="standard"
                      buttonSize="medium"
                      href={connectUrl}
                      fontWeight="medium"
                      maxWidth="220px"
                      mx="auto"
                      width={1}
                    >
                      <Flex display="inline-flex" alignItems="center" justifyContent="space-evenly">
                        <Github size={17} fill={colors.black[500]} />
                        Authenticate
                      </Flex>
                    </StyledLink>
                  </Fragment>
                )}
                {step === 'valid' && (
                  <Fragment>
                    <Flex justifyContent="center" mb={4}>
                      <svg
                        id="success"
                        width="66"
                        height="66"
                        viewBox="0 0 66 66"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle cx="33" cy="33" r="32.5" fill="white" stroke="#6CE0A2" />
                        <path
                          d="M29.6183 43C29.0316 43 28.4672 42.7688 28.0472 42.3488L21.6517 35.952C20.7828 35.0851 20.7828 33.6804 21.6517 32.8114C22.5205 31.9423 23.925 31.9423 24.7938 32.8114L29.3383 37.3567L40.9715 23.9253C41.687 22.9317 43.0715 22.7006 44.0737 23.4163C45.0714 24.132 45.2981 25.5211 44.5826 26.5169L31.4227 42.0754C31.0249 42.6333 30.3671 43 29.6183 43Z"
                          fill="#00B856"
                        />
                      </svg>
                    </Flex>
                    <H5 fontWeight="medium" mb={4} textAlign="center">
                      Congratulations!
                    </H5>
                    <P textAlign="center" color="black.600" mb={4}>
                      We have succesfully validated your admin status. Press the button below to activate this open
                      collective. It will also email all pledgers to fulfill their pledges.
                    </P>
                    <StyledButton
                      buttonStyle="primary"
                      buttonSize="medium"
                      maxWidth={300}
                      mx="auto"
                      onClick={() => this.claim(data.Collective.id)}
                    >
                      Activate open collective
                    </StyledButton>
                  </Fragment>
                )}
              </Container>

              <Link route="collective" params={{ slug }} passHref>
                <StyledLink fontSize="Caption" mt={5} textAlign="center">
                  &larr; Back to the collective page
                </StyledLink>
              </Link>
            </Container>
          </Container>
        </Body>
        <Footer />
      </Fragment>
    );
  }
}

const addPledgesData = graphql(gql`
  query collectivePledges($slug: String) {
    Collective(slug: $slug) {
      id
      name
      website
      githubHandle
    }
  }
`);

const addClaimCollectiveMutation = graphql(
  gql`
    mutation claimCollective($id: Int!) {
      claimCollective(id: $id) {
        id
        slug
      }
    }
  `,
  {
    props: ({ mutate }) => ({
      claimCollective: id => mutate({ variables: { id } }),
    }),
  },
);

const addGraphQL = compose(
  addPledgesData,
  addClaimCollectiveMutation,
);

export { ClaimCollectivePage as MockClaimCollectivePage };
export default withData(withLoggedInUser(addGraphQL(withIntl(ClaimCollectivePage))));
