import * as React from "react";

import "@modules/editor/tab/TabbedComponent.css";

interface TabbedComponentPageProps {
  title: string;
  children: React.ReactNode;
}

interface TabbedComponentPageState {}

class TabbedComponentPage extends React.Component<TabbedComponentPageProps, TabbedComponentPageState> {
  constructor(props: TabbedComponentPageProps) {
    super(props);
  }

  render() {
    const { children } = this.props;

    return (
      <div className="tabbed-component-page">
        {React.Children.map(children, (child: React.ReactNode) => {
          return child;
        })}
      </div>
    );
  }
}

interface TabbedComponentProps {
  children: React.ReactNode;
}

interface TabbedComponentState {
  activeTab: number;
}

class TabbedComponent extends React.Component<TabbedComponentProps, TabbedComponentState> {
  constructor(props: TabbedComponentProps) {
    super(props);

    this.state = {
      activeTab: 0
    };
  }

  render() {
    const { children } = this.props;
    const { activeTab } = this.state;

    return (
      <div className="tabbed-component">
        <ul>
          {React.Children.map(children, (child: React.ReactNode, index: number) => {
            if (!React.isValidElement(child) || child.type !== TabbedComponentPage)
              return null;

            const childTab = child as React.ReactElement<TabbedComponentPageProps>;
            const childTabInteract = () => {
              this.setState({
                activeTab: index
              });
            }

            return (
              <li key={index}
                  className={activeTab === index ? "active" : ""}
                  onClick={childTabInteract}
                  onFocus={childTabInteract}
                  tabIndex={0}>
                {childTab.props.title}
              </li>
            );
          })}
        </ul>
        <div>
          {React.Children.map(children, (child: React.ReactNode, index: number) => {
            if (!React.isValidElement(child) || child.type !== TabbedComponentPage)
              return null;

            return (
              <div key={index}
                   className={activeTab === index ? "active" : ""}>
                {child}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}

export { TabbedComponent, TabbedComponentPage };